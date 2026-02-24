/**
 * /api/auth/verify-email
 * POST: Verify email using token
 * GET: Check token validity
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendWelcomeEmail } from '@/lib/email/client';
import { z } from 'zod';

const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

// GET - Check if token is valid (for UI to show appropriate state)
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { valid: false, error: 'Token is required' },
        { status: 400 }
      );
    }

    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken) {
      return NextResponse.json(
        { valid: false, error: 'Invalid verification link' },
        { status: 400 }
      );
    }

    if (new Date() > verificationToken.expires) {
      return NextResponse.json(
        { valid: false, error: 'Verification link has expired' },
        { status: 400 }
      );
    }

    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error('Verify email check error:', error);
    return NextResponse.json(
      { valid: false, error: 'Something went wrong' },
      { status: 500 }
    );
  }
}

// POST - Actually verify the email
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = verifyEmailSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    const { token } = result.data;

    // Find the verification token
    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken) {
      return NextResponse.json(
        { error: 'Invalid verification link. It may have already been used.' },
        { status: 400 }
      );
    }

    // Check if token is expired
    if (new Date() > verificationToken.expires) {
      // Delete expired token
      await prisma.verificationToken.delete({
        where: { token },
      });

      return NextResponse.json(
        { error: 'This verification link has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    // Find user by identifier (email)
    const user = await prisma.user.findUnique({
      where: { email: verificationToken.identifier },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found.' },
        { status: 404 }
      );
    }

    // Check if already verified
    if (user.emailVerified) {
      // Delete the token since it's no longer needed
      await prisma.verificationToken.deleteMany({
        where: { token },
      });

      return NextResponse.json({
        message: 'Your email is already verified.',
        alreadyVerified: true,
      });
    }

    // Update user emailVerified and delete token
    // Use deleteMany to avoid errors if token was already deleted by a concurrent request
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    });
    await prisma.verificationToken.deleteMany({
      where: { token },
    });

    // Send welcome email after successful verification
    sendWelcomeEmail(user.email!, user.name || '').catch((err) => {
      console.error('Failed to send welcome email:', err);
    });

    return NextResponse.json({
      message: 'Email verified successfully! You can now sign in.',
    });
  } catch (error) {
    console.error('Verify email error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
