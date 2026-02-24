/**
 * /api/auth/forgot-password
 * POST: Request password reset email
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendPasswordResetEmail } from '@/lib/email/client';
import { randomBytes } from 'crypto';
import { z } from 'zod';

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = forgotPasswordSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    const { email } = result.data;

    // Find user by email with their linked accounts
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        accounts: {
          select: { provider: true },
        },
      },
    });

    // User exists but is OAuth-only (no password set)
    if (user && !user.password) {
      const providers = user.accounts.map((a) => a.provider);
      return NextResponse.json({
        message: 'This account uses a social login provider.',
        oauthOnly: true,
        providers,
      });
    }

    // User exists and has a password - send reset email
    if (user && user.password) {
      // Delete any existing tokens for this user
      await prisma.verificationToken.deleteMany({
        where: { identifier: user.email },
      });

      // Generate secure token
      const token = randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Create verification token
      await prisma.verificationToken.create({
        data: {
          identifier: user.email,
          token,
          expires,
        },
      });

      // Send reset email
      const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password/${token}`;
      await sendPasswordResetEmail(user.email, user.name || '', resetUrl);
    }

    // User not found OR email sent - return generic success
    return NextResponse.json({
      message: 'If an account with that email exists, we sent a password reset link.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
