/**
 * POST /api/verify-email/send
 * Send a 6-digit verification code to an email address.
 * Returns HMAC signature + expiry for stateless verification.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createVerification, type VerificationType } from '@/server/auth/email-verification';
import { sendVerificationCodeEmail } from '@/server/integrations/email/client';
import { checkRateLimit } from '@/server/infrastructure/queue/rate-limiter';

const schema = z.object({
  email: z.string().email(),
  type: z.enum(['BOOKING_CREATE', 'BOOKING_MANAGE']),
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

    const { email, type } = validated.data;

    // Rate limit: 3 sends per email per 10 minutes
    const rl = await checkRateLimit(email.toLowerCase(), { limit: 3, windowSeconds: 600, prefix: 'verify_send' });
    if (!rl.allowed) {
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
