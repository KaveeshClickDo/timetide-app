/**
 * POST /api/verify-email/check
 * Verify a 6-digit code against the HMAC signature.
 * Stateless — no database lookup needed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyCode, type VerificationType } from '@/server/auth/email-verification';
import { checkRateLimit } from '@/server/infrastructure/queue/rate-limiter';

const schema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  type: z.enum(['BOOKING_CREATE', 'BOOKING_MANAGE']),
  signature: z.string(),
  expiresAt: z.number(),
});

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

    // Rate limit: 5 attempts per email per 10 minutes
    const rl = await checkRateLimit(email.toLowerCase(), { limit: 5, windowSeconds: 600, prefix: 'verify_check' });
    if (!rl.allowed) {
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
