/**
 * Auth operations: signup, forgot-password, reset-password,
 * verify-email, resend-verification, check-onboarding.
 *
 * Handles: password hashing, username generation, default data creation,
 * verification tokens, email dispatch, and rate limiting context.
 */

import prisma from '@/server/db/prisma'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import { randomBytes } from 'crypto'
import { sendEmailVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } from '@/server/integrations/email/client'

// ── Domain errors ─────────────────────────────────────────────────────────────

export class AuthUserAlreadyExistsError extends Error {
  constructor() {
    super('An account with this email already exists')
    this.name = 'AuthUserAlreadyExistsError'
  }
}

export class AuthInvalidTokenError extends Error {
  constructor(message = 'Invalid or expired reset link. Please request a new one.') {
    super(message)
    this.name = 'AuthInvalidTokenError'
  }
}

export class AuthTokenExpiredError extends Error {
  constructor(message = 'This reset link has expired. Please request a new one.') {
    super(message)
    this.name = 'AuthTokenExpiredError'
  }
}

export class AuthUserNotFoundError extends Error {
  constructor() {
    super('User not found.')
    this.name = 'AuthUserNotFoundError'
  }
}

// ── Signup ────────────────────────────────────────────────────────────────────

export interface SignupInput {
  name: string
  email: string
  password: string
}

export interface SignupResult {
  user: { id: string; name: string | null; email: string | null; username: string | null }
  message: string
}

export async function signup(input: SignupInput): Promise<SignupResult> {
  const { name, email, password } = input

  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { accounts: { select: { provider: true } } },
  })
  if (existingUser) throw new AuthUserAlreadyExistsError()

  const hashedPassword = await bcrypt.hash(password, 12)

  // Generate unique username
  const emailPrefix = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '')
  let username = emailPrefix
  let counter = 1
  while (await prisma.user.findUnique({ where: { username } })) {
    username = `${emailPrefix}${counter}`
    counter++
  }

  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      username,
      timezone: 'UTC',
    },
    select: { id: true, name: true, email: true, username: true },
  })

  // Create default availability schedule
  const schedule = await prisma.availabilitySchedule.create({
    data: {
      userId: user.id,
      name: 'Working Hours',
      isDefault: true,
      timezone: 'UTC',
      slots: {
        create: [
          { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
          { dayOfWeek: 2, startTime: '09:00', endTime: '17:00' },
          { dayOfWeek: 3, startTime: '09:00', endTime: '17:00' },
          { dayOfWeek: 4, startTime: '09:00', endTime: '17:00' },
          { dayOfWeek: 5, startTime: '09:00', endTime: '17:00' },
        ],
      },
    },
  })

  // Create default event type
  await prisma.eventType.create({
    data: {
      userId: user.id,
      title: '30 Minute Meeting',
      slug: `30min-${nanoid(6)}`,
      description: 'A quick 30-minute meeting',
      length: 30,
      locationType: 'GOOGLE_MEET',
      isActive: true,
      scheduleId: schedule.id,
    },
  })

  // Create verification token
  const verificationToken = randomBytes(32).toString('hex')
  const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000)

  await prisma.verificationToken.create({
    data: {
      identifier: user.email!,
      token: verificationToken,
      expires: tokenExpires,
    },
  })

  // Send verification email (fire-and-forget)
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify-email/${verificationToken}`
  sendEmailVerificationEmail(user.email!, user.name || '', verifyUrl).catch((err) => {
    console.error('Failed to send verification email:', err)
  })

  return {
    user: { id: user.id, name: user.name, email: user.email, username: user.username },
    message: 'Account created! Please check your email to verify your account.',
  }
}

// ── Forgot password ──────────────────────────────────────────────────────────

export interface ForgotPasswordResult {
  message: string
  oauthOnly?: boolean
  providers?: string[]
}

export async function forgotPassword(email: string): Promise<ForgotPasswordResult> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      name: true,
      email: true,
      password: true,
      accounts: { select: { provider: true } },
    },
  })

  // OAuth-only user
  if (user && !user.password) {
    return {
      message: 'This account uses a social login provider.',
      oauthOnly: true,
      providers: user.accounts.map((a) => a.provider),
    }
  }

  // User with password — send reset email
  if (user && user.password) {
    await prisma.verificationToken.deleteMany({
      where: { identifier: user.email! },
    })

    const token = randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await prisma.verificationToken.create({
      data: { identifier: user.email!, token, expires },
    })

    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password/${token}`
    await sendPasswordResetEmail(user.email!, user.name || '', resetUrl)
  }

  // Generic response (prevents email enumeration)
  return { message: 'If an account with that email exists, we sent a password reset link.' }
}

// ── Reset password ───────────────────────────────────────────────────────────

export interface ResetPasswordResult {
  message: string
}

export async function resetPassword(token: string, password: string): Promise<ResetPasswordResult> {
  const verificationToken = await prisma.verificationToken.findUnique({
    where: { token },
  })

  if (!verificationToken) throw new AuthInvalidTokenError()

  if (new Date() > verificationToken.expires) {
    await prisma.verificationToken.delete({ where: { token } })
    throw new AuthTokenExpiredError()
  }

  const user = await prisma.user.findUnique({
    where: { email: verificationToken.identifier },
  })
  if (!user) throw new AuthUserNotFoundError()

  const hashedPassword = await bcrypt.hash(password, 12)

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { password: hashedPassword } }),
    prisma.verificationToken.delete({ where: { token } }),
  ])

  return { message: 'Password reset successfully. You can now sign in with your new password.' }
}

// ── Check verify-email token ─────────────────────────────────────────────────

export interface CheckTokenResult {
  valid: boolean
  error?: string
}

export async function checkVerifyToken(token: string): Promise<CheckTokenResult> {
  if (!token) return { valid: false, error: 'Token is required' }

  const verificationToken = await prisma.verificationToken.findUnique({ where: { token } })
  if (!verificationToken) return { valid: false, error: 'Invalid verification link' }
  if (new Date() > verificationToken.expires) return { valid: false, error: 'Verification link has expired' }

  return { valid: true }
}

// ── Verify email ─────────────────────────────────────────────────────────────

export interface VerifyEmailResult {
  message: string
  alreadyVerified?: boolean
}

export async function verifyEmail(token: string): Promise<VerifyEmailResult> {
  const verificationToken = await prisma.verificationToken.findUnique({ where: { token } })

  if (!verificationToken) {
    throw new AuthInvalidTokenError('Invalid verification link. It may have already been used.')
  }

  if (new Date() > verificationToken.expires) {
    await prisma.verificationToken.delete({ where: { token } })
    throw new AuthTokenExpiredError('This verification link has expired. Please request a new one.')
  }

  const user = await prisma.user.findUnique({
    where: { email: verificationToken.identifier },
  })
  if (!user) throw new AuthUserNotFoundError()

  if (user.emailVerified) {
    await prisma.verificationToken.deleteMany({ where: { token } })
    return { message: 'Your email is already verified.', alreadyVerified: true }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: new Date() },
  })
  await prisma.verificationToken.deleteMany({ where: { token } })

  sendWelcomeEmail(user.email!, user.name || '').catch((err) => {
    console.error('Failed to send welcome email:', err)
  })

  return { message: 'Email verified successfully! You can now sign in.' }
}

// ── Resend verification ──────────────────────────────────────────────────────

export interface ResendVerificationResult {
  message: string
  alreadyVerified?: boolean
}

export async function resendVerification(email: string): Promise<ResendVerificationResult> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, name: true, email: true, emailVerified: true },
  })

  // Prevent email enumeration
  if (!user) {
    return { message: 'If an account with that email exists, we sent a verification link.' }
  }

  if (user.emailVerified) {
    return { message: 'Your email is already verified.', alreadyVerified: true }
  }

  await prisma.verificationToken.deleteMany({
    where: { identifier: user.email! },
  })

  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000)

  await prisma.verificationToken.create({
    data: { identifier: user.email!, token, expires },
  })

  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify-email/${token}`
  await sendEmailVerificationEmail(user.email!, user.name || '', verifyUrl)

  return { message: 'Verification email sent! Please check your inbox.' }
}

// ── Check onboarding ─────────────────────────────────────────────────────────

export async function checkOnboarding(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingCompleted: true },
  })
  return !user?.onboardingCompleted
}
