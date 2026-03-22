/**
 * Stateless HMAC-based email verification
 * No database needed — uses signed codes that are verified server-side
 */

import crypto from 'crypto';

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.EMAIL_VERIFICATION_SECRET;
  if (!secret) {
    throw new Error('Missing NEXTAUTH_SECRET or EMAIL_VERIFICATION_SECRET environment variable');
  }
  return secret;
}
const SECRET = getSecret();
const CODE_LENGTH = 6;
const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

export type VerificationType = 'BOOKING_CREATE' | 'BOOKING_MANAGE';

interface VerificationPayload {
  email: string;
  code: string;
  type: VerificationType;
  expiresAt: number; // unix timestamp ms
}

function generateHmac(payload: VerificationPayload): string {
  const data = `${payload.email.toLowerCase()}:${payload.code}:${payload.type}:${payload.expiresAt}`;
  return crypto.createHmac('sha256', SECRET).update(data).digest('hex');
}

/** Generate a 6-digit numeric code */
function generateCode(): string {
  const code = crypto.randomInt(0, 10 ** CODE_LENGTH);
  return code.toString().padStart(CODE_LENGTH, '0');
}

/** Create a verification code + signature for an email */
export function createVerification(email: string, type: VerificationType) {
  const code = generateCode();
  const expiresAt = Date.now() + CODE_EXPIRY_MS;
  const payload: VerificationPayload = { email: email.toLowerCase(), code, type, expiresAt };
  const signature = generateHmac(payload);

  return {
    code,
    expiresAt,
    signature,
  };
}

/** Verify a code + signature pair. Returns { valid, error? } */
export function verifyCode(
  email: string,
  code: string,
  type: VerificationType,
  signature: string,
  expiresAt: number
): { valid: boolean; error?: string } {
  // Check expiry
  if (Date.now() > expiresAt) {
    return { valid: false, error: 'Verification code has expired' };
  }

  // Recreate the HMAC and compare
  const payload: VerificationPayload = { email: email.toLowerCase(), code, type, expiresAt };
  const expected = generateHmac(payload);

  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
    return { valid: false, error: 'Invalid verification code' };
  }

  return { valid: true };
}
