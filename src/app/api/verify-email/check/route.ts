/**
 * POST /api/verify-email/check
 * Verify a 6-digit code against the HMAC signature.
 * Stateless — no database lookup needed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyCode, type VerificationType } from '@/lib/email-verification';

const schema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  type: z.enum(['BOOKING_CREATE', 'BOOKING_MANAGE']),
  signature: z.string(),
  expiresAt: z.number(),
});

// Rate limit: max 5 verify attempts per email per 10 minutes
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
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

    const { email, code, type, signature, expiresAt } = validated.data;

    // Rate limit
    if (!checkRateLimit(email)) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please request a new code.' },
        { status: 429 }
      );
    }

    // Verify the code
    const result = verifyCode(email, code, type as VerificationType, signature, expiresAt);

    if (!result.valid) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ verified: true });
  } catch (error) {
    console.error('Verify email check error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
