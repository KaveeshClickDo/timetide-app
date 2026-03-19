/**
 * NextAuth Configuration for TimeTide
 * Supports: Google OAuth, Email/Password
 */

import { NextAuthOptions } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import GoogleProvider from 'next-auth/providers/google';

import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import prisma from './prisma';
import { loginSchema } from './validation/schemas';
import { sendWelcomeEmail } from './integrations/email/client';
import { type PlanTier, type PlanLimits } from './pricing';
import { getPlanLimitsAsync } from './pricing-server';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions['adapter'],

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          prompt: 'select_account',
          access_type: 'offline',
          response_type: 'code',
        },
      },
    }),

    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          const validated = loginSchema.parse(credentials);

          const user = await prisma.user.findUnique({
            where: { email: validated.email },
          });

          if (!user || !user.password) {
            return null;
          }

          const isValid = await bcrypt.compare(
            validated.password,
            user.password
          );

          if (!isValid) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
          };
        } catch {
          return null;
        }
      },
    }),
  ],

  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },

  pages: {
    signIn: '/auth/signin',
    signOut: '/auth/signin',
    error: '/auth/signin',
    // Don't use newUser here - it fires for account linking too.
    // Onboarding redirect is handled in signIn callback instead.
  },

  callbacks: {
    async signIn({ user, account }) {
      // For credentials, user must exist with password
      if (account?.provider === 'credentials') {
        if (!user.email) return false;
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email },
        });
        return !!existingUser?.password;
      }

      // For OAuth: always allow sign-in. Onboarding redirect is handled
      // by middleware after the JWT session is created.
      // NOTE: Do NOT return a URL string here — it short-circuits JWT
      // creation in NextAuth v4, causing a redirect loop.

      // When an OAuth provider (e.g. Google) links to an existing credential user,
      // the PrismaAdapter doesn't update emailVerified. Since the OAuth provider
      // already verified email ownership, mark it as verified now.
      // Also clear any password that was set before verification — the person
      // who set it never proved they own this email, so it's untrusted.
      if (user.email) {
        await prisma.user.updateMany({
          where: { email: user.email, emailVerified: null },
          data: { emailVerified: new Date(), password: null },
        });
      }

      return true;
    },

    async jwt({ token, user, account, trigger, session }) {
      // Handle session updates
      if (trigger === 'update') {
        // If no session payload, force a DB re-sync (used after Stripe checkout etc.)
        if (!session) {
          if (token.id) {
            const dbUser = await prisma.user.findUnique({
              where: { id: token.id as string },
              select: { plan: true, subscriptionStatus: true, planExpiresAt: true, gracePeriodEndsAt: true, cleanupScheduledAt: true },
            });
            if (dbUser) {
              const plan = (dbUser.plan ?? 'FREE') as PlanTier;
              token.plan = plan;
              token.subscriptionStatus = dbUser.subscriptionStatus ?? 'NONE';
              token.planExpiresAt = dbUser.planExpiresAt?.getTime();
              token.gracePeriodEndsAt = dbUser.gracePeriodEndsAt?.getTime();
              token.cleanupScheduledAt = dbUser.cleanupScheduledAt?.getTime();
              token.planLimits = await getPlanLimitsAsync(plan);
              token.lastVerified = Date.now();
            }
          }
          return token;
        }
        // Handle impersonation start
        if (session.impersonateUserId && token.role === 'ADMIN') {
          const targetUser = await prisma.user.findUnique({
            where: { id: session.impersonateUserId },
            select: { id: true, username: true, name: true, timezone: true, timezoneAutoDetect: true, bio: true, plan: true, role: true, onboardingCompleted: true, emailVerified: true, password: true },
          });
          if (targetUser) {
            token.originalAdminId = token.id as string;
            token.impersonatingUserId = targetUser.id;
            token.id = targetUser.id;
            token.username = targetUser.username ?? undefined;
            token.name = targetUser.name;
            token.timezone = targetUser.timezone;
            token.timezoneAutoDetect = targetUser.timezoneAutoDetect;
            token.bio = targetUser.bio ?? undefined;
            token.plan = targetUser.plan;
            token.role = targetUser.role;
            token.onboardingCompleted = targetUser.onboardingCompleted;
            token.emailVerified = !!targetUser.emailVerified || !targetUser.password;
            return token;
          }
        }

        // Handle impersonation exit
        if (session.exitImpersonation && token.originalAdminId) {
          const adminUser = await prisma.user.findUnique({
            where: { id: token.originalAdminId },
            select: { id: true, username: true, name: true, timezone: true, timezoneAutoDetect: true, bio: true, plan: true, role: true, onboardingCompleted: true, emailVerified: true, password: true },
          });
          if (adminUser) {
            token.id = adminUser.id;
            token.username = adminUser.username ?? undefined;
            token.name = adminUser.name;
            token.timezone = adminUser.timezone;
            token.timezoneAutoDetect = adminUser.timezoneAutoDetect;
            token.bio = adminUser.bio ?? undefined;
            token.plan = adminUser.plan;
            token.role = adminUser.role;
            token.onboardingCompleted = adminUser.onboardingCompleted;
            token.emailVerified = !!adminUser.emailVerified || !adminUser.password;
            delete token.originalAdminId;
            delete token.impersonatingUserId;
            return token;
          }
        }

        // Only allow safe fields to be updated via session.update()
        // Never allow role, plan, emailVerified, id, or other sensitive fields
        const allowedFields = ['name', 'username', 'timezone', 'timezoneAutoDetect', 'bio', 'image', 'onboardingCompleted'] as const
        for (const field of allowedFields) {
          if (session.user?.[field] !== undefined) {
            (token as Record<string, unknown>)[field] = session.user[field]
          }
        }
        // NextAuth uses token.picture for session.user.image
        if (session.user?.image !== undefined) {
          token.picture = session.user.image
        }
        return token
      }

      if (user) {
        token.id = user.id;

        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { username: true, timezone: true, timezoneAutoDetect: true, bio: true, plan: true, role: true, emailVerified: true, password: true, onboardingCompleted: true, subscriptionStatus: true, planExpiresAt: true, gracePeriodEndsAt: true, cleanupScheduledAt: true },
        });

        token.username = dbUser?.username ?? undefined;
        token.timezone = dbUser?.timezone ?? 'UTC';
        token.timezoneAutoDetect = dbUser?.timezoneAutoDetect ?? true;
        token.bio = dbUser?.bio ?? undefined;
        const userPlan = (dbUser?.plan ?? 'FREE') as PlanTier;
        token.plan = userPlan;
        token.role = dbUser?.role ?? 'USER';
        token.onboardingCompleted = dbUser?.onboardingCompleted ?? false;
        // Only require email verification for credential users (have password)
        token.emailVerified = !!dbUser?.emailVerified || !dbUser?.password;
        token.subscriptionStatus = dbUser?.subscriptionStatus ?? 'NONE';
        token.planExpiresAt = dbUser?.planExpiresAt?.getTime();
        token.gracePeriodEndsAt = dbUser?.gracePeriodEndsAt?.getTime();
        token.cleanupScheduledAt = dbUser?.cleanupScheduledAt?.getTime();
        token.planLimits = await getPlanLimitsAsync(userPlan);
        token.lastVerified = Date.now();

        // Auto-assign ADMIN role based on ADMIN_EMAILS env variable
        const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
        if (user.email && adminEmails.includes(user.email.toLowerCase()) && dbUser?.role !== 'ADMIN') {
          await prisma.user.update({
            where: { id: user.id },
            data: { role: 'ADMIN' },
          });
          token.role = 'ADMIN';
        }
      }

      // Periodically verify user still exists in DB (every 1 minute)
      const VERIFY_INTERVAL = 1 * 60 * 1000;
      const lastVerified = (token.lastVerified as number) ?? 0;

      if (token.id && Date.now() - lastVerified > VERIFY_INTERVAL) {
        // During impersonation, verify the original admin still exists
        const verifyUserId = (token.originalAdminId || token.id) as string;
        const dbUser = await prisma.user.findUnique({
          where: { id: verifyUserId },
          select: { id: true, plan: true, role: true, emailVerified: true, password: true, onboardingCompleted: true, isDisabled: true, subscriptionStatus: true, planExpiresAt: true, gracePeriodEndsAt: true, cleanupScheduledAt: true },
        });

        if (!dbUser || dbUser.isDisabled) {
          // Return empty token to force session invalidation
          return {} as typeof token;
        }

        // Sync fields in case they changed (skip during impersonation to avoid overwriting)
        if (!token.impersonatingUserId) {
          const syncPlan = (dbUser.plan ?? 'FREE') as PlanTier;
          token.plan = syncPlan;
          token.role = dbUser.role ?? 'USER';
          token.onboardingCompleted = dbUser.onboardingCompleted ?? false;
          token.emailVerified = !!dbUser.emailVerified || !dbUser.password;
          token.subscriptionStatus = dbUser.subscriptionStatus ?? 'NONE';
          token.planExpiresAt = dbUser.planExpiresAt?.getTime();
          token.gracePeriodEndsAt = dbUser.gracePeriodEndsAt?.getTime();
          token.cleanupScheduledAt = dbUser.cleanupScheduledAt?.getTime();
          token.planLimits = await getPlanLimitsAsync(syncPlan);
        }
        token.lastVerified = Date.now();
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.username = token.username as string | undefined;
        session.user.timezone = token.timezone as string;
        session.user.timezoneAutoDetect = token.timezoneAutoDetect as boolean;
        session.user.bio = token.bio as string | undefined;
        session.user.plan = token.plan as string;
        session.user.role = token.role as string;
        session.user.emailVerified = token.emailVerified as boolean;
        if (token.impersonatingUserId) {
          session.user.impersonating = true;
          session.user.originalAdminId = token.originalAdminId as string;
        }
        session.user.subscriptionStatus = token.subscriptionStatus as string;
        session.user.planExpiresAt = token.planExpiresAt as number | undefined;
        session.user.gracePeriodEndsAt = token.gracePeriodEndsAt as number | undefined;
        session.user.cleanupScheduledAt = token.cleanupScheduledAt as number | undefined;
        session.user.planLimits = token.planLimits as PlanLimits | undefined;
        // Expose token issued time so client can show session expiry warning
        session.user.tokenIssuedAt = token.iat as number;
      }
      return session;
    },
  },

  events: {
    async createUser({ user }) {
      // Check if this user already has data (e.g. credential user now linking OAuth)
      const existingSchedule = await prisma.availabilitySchedule.findFirst({
        where: { userId: user.id },
      });

      // Generate a default username if not already set
      if (user.email) {
        const currentUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { username: true },
        });

        if (!currentUser?.username) {
          const username = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
          let finalUsername = username;
          let counter = 1;

          while (await prisma.user.findUnique({ where: { username: finalUsername } })) {
            finalUsername = `${username}${counter}`;
            counter++;
          }

          await prisma.user.update({
            where: { id: user.id },
            data: { username: finalUsername },
          });
        }
      }

      // Only create defaults if user doesn't already have them
      // (credential signup creates these via the signup API route)
      if (!existingSchedule) {
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
        });

        await prisma.eventType.create({
          data: {
            userId: user.id,
            title: '30 Minute Meeting',
            slug: '30-minute-meeting',
            description: 'A quick 30-minute meeting.',
            length: 30,
            isActive: true,
            scheduleId: schedule.id,
          },
        });
      }

      // Send welcome email only for truly new OAuth users
      // Don't send if user already has data (existing credential user linking OAuth)
      if (user.email && !existingSchedule) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { emailVerified: true, password: true },
        });
        // OAuth users have emailVerified set and no password
        if (dbUser?.emailVerified || !dbUser?.password) {
          sendWelcomeEmail(user.email, user.name || '').catch((err) => {
            console.error('Failed to send welcome email:', err);
          });
        }
      }
    },
  },

  debug: process.env.NODE_ENV === 'development',
};

// Type augmentation for next-auth
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      username?: string;
      timezone: string;
      timezoneAutoDetect: boolean;
      bio?: string;
      plan: string;
      role: string;
      emailVerified: boolean;
      subscriptionStatus: string;
      planExpiresAt?: number;
      gracePeriodEndsAt?: number;
      cleanupScheduledAt?: number;
      planLimits?: PlanLimits;
      tokenIssuedAt?: number;
      impersonating?: boolean;
      originalAdminId?: string;
    };
  }

  interface User {
    username?: string;
    timezone?: string;
    timezoneAutoDetect?: boolean;
    bio?: string;
    plan?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    username?: string;
    timezone: string;
    timezoneAutoDetect: boolean;
    bio?: string;
    plan: string;
    role: string;
    onboardingCompleted: boolean;
    emailVerified: boolean;
    lastVerified?: number;
    accessToken?: string;
    refreshToken?: string;
    provider?: string;
    subscriptionStatus: string;
    planExpiresAt?: number;
    gracePeriodEndsAt?: number;
    cleanupScheduledAt?: number;
    planLimits?: PlanLimits;
    impersonatingUserId?: string;
    originalAdminId?: string;
  }
}
