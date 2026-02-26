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
import { sendWelcomeEmail } from './email/client';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions['adapter'],

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          prompt: 'consent',
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
    maxAge: 30 * 24 * 60 * 60, // 30 days
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

      // For OAuth: redirect new users (not yet onboarded) to onboarding
      // Existing users linking a new OAuth provider should go to dashboard
      if (user.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { onboardingCompleted: true },
        });
        if (dbUser && !dbUser.onboardingCompleted) {
          return '/dashboard/onboarding';
        }
      }

      return true;
    },

    async jwt({ token, user, account, trigger, session }) {
      // Handle session updates
      if (trigger === 'update' && session) {
        const updated = { ...token, ...session.user }
        // NextAuth uses token.picture for session.user.image
        if (session.user?.image !== undefined) {
          updated.picture = session.user.image
        }
        return updated
      }

      if (user) {
        token.id = user.id;

        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { username: true, timezone: true, timezoneAutoDetect: true, bio: true, plan: true, emailVerified: true, password: true },
        });

        token.username = dbUser?.username ?? undefined;
        token.timezone = dbUser?.timezone ?? 'UTC';
        token.timezoneAutoDetect = dbUser?.timezoneAutoDetect ?? true;
        token.bio = dbUser?.bio ?? undefined;
        token.plan = dbUser?.plan ?? 'FREE';
        // Only require email verification for credential users (have password)
        token.emailVerified = !!dbUser?.emailVerified || !dbUser?.password;
        token.lastVerified = Date.now();
      }

      // Periodically verify user still exists in DB (every 5 minutes)
      const VERIFY_INTERVAL = 5 * 60 * 1000;
      const lastVerified = (token.lastVerified as number) ?? 0;

      if (token.id && Date.now() - lastVerified > VERIFY_INTERVAL) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { id: true, plan: true, emailVerified: true, password: true },
        });

        if (!dbUser) {
          // Return empty token to force session invalidation
          return {} as typeof token;
        }

        // Sync plan and emailVerified in case they changed
        token.plan = dbUser.plan ?? 'FREE';
        token.emailVerified = !!dbUser.emailVerified || !dbUser.password;
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
        session.user.emailVerified = token.emailVerified as boolean;
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
      emailVerified: boolean;
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
    emailVerified: boolean;
    lastVerified?: number;
    accessToken?: string;
    refreshToken?: string;
    provider?: string;
  }
}
