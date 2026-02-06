/**
 * /api/auth/resend-verification
 * POST: Resend email verification
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmailVerificationEmail } from '@/lib/email/client';
import { randomBytes } from 'crypto';
import { z } from 'zod';

const resendSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = resendSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    const { email } = result.data;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, name: true, email: true, emailVerified: true },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return NextResponse.json({
        message: 'If an account with that email exists, we sent a verification link.',
      });
    }

    // Check if already verified
    if (user.emailVerified) {
      return NextResponse.json({
        message: 'Your email is already verified.',
        alreadyVerified: true,
      });
    }

    // Delete any existing tokens for this user
    await prisma.verificationToken.deleteMany({
      where: { identifier: user.email },
    });

    // Generate new token
    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create verification token
    await prisma.verificationToken.create({
      data: {
        identifier: user.email,
        token,
        expires,
      },
    });

    // Send verification email
    const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify-email/${token}`;
    await sendEmailVerificationEmail(user.email, user.name || '', verifyUrl);

    return NextResponse.json({
      message: 'Verification email sent! Please check your inbox.',
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
