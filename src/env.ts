/**
 * Environment Variable Validation
 * Validates all required env vars at build/startup time using @t3-oss/env-nextjs.
 * Import this file early (e.g., in layout.tsx or next.config) to fail fast on missing vars.
 */

import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  // ── Server-side variables (never exposed to the browser) ──
  server: {
    DATABASE_URL: z.string().url(),
    NEXTAUTH_SECRET: z.string().min(1),
    NEXTAUTH_URL: z.string().url(),

    // Google OAuth
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),

    // Email (Resend)
    RESEND_API_KEY: z.string().min(1),
    EMAIL_FROM: z.string().min(1),

    // Redis (optional — app has in-memory fallback)
    REDIS_URL: z.string().url().optional(),

    // Optional integrations
    ZOOM_CLIENT_ID: z.string().min(1).optional(),
    ZOOM_CLIENT_SECRET: z.string().min(1).optional(),
    MICROSOFT_CLIENT_ID: z.string().min(1).optional(),
    MICROSOFT_CLIENT_SECRET: z.string().min(1).optional(),
    MICROSOFT_TENANT_ID: z.string().min(1).optional(),
  },

  // ── Client-side variables (prefixed with NEXT_PUBLIC_) ──
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_APP_NAME: z.string().min(1).optional(),
  },

  // ── Runtime values (tells the library where to read from) ──
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    REDIS_URL: process.env.REDIS_URL,
    ZOOM_CLIENT_ID: process.env.ZOOM_CLIENT_ID,
    ZOOM_CLIENT_SECRET: process.env.ZOOM_CLIENT_SECRET,
    MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
    MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
    MICROSOFT_TENANT_ID: process.env.MICROSOFT_TENANT_ID,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  },

  // Skip validation during docker build or CI where env vars aren't available
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
