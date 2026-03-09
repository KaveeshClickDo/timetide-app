/**
 * POST /api/verify-email/send
 * Send a 6-digit verification code to an email address.
 * Returns HMAC signature + expiry for stateless verification.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createVerification, type VerificationType } from '@/lib/email-verification';
import { sendVerificationCodeEmail } from '@/lib/integrations/email/client';

const schema = z.object({
  email: z.string().email(),
  type: z.enum(['BOOKING_CREATE', 'BOOKING_MANAGE']),
});

// Simple in-memory rate limit: max 3 sends per email per 10 minutes
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function checkRateLimit(email: string): boolean {
  const key = email.toLowerCase();
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = schema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { email, type } = validated.data;

    // Rate limit
    if (!checkRateLimit(email)) {
      return NextResponse.json(
        { error: 'Too many verification requests. Please try again later.' },
        { status: 429 }
      );
    }

    // Generate code + HMAC signature
    const { code, expiresAt, signature } = createVerification(email, type as VerificationType);

    // Send email
    const sent = await sendVerificationCodeEmail(email, code);
    if (!sent) {
      return NextResponse.json(
        { error: 'Failed to send verification email. Please try again.' },
        { status: 500 }
      );
    }

    // Return signature + expiry (NOT the code — that's only in the email)
    return NextResponse.json({
      signature,
      expiresAt,
    });
  } catch (error) {
    console.error('Verify email send error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
