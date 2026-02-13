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
    newUser: '/dashboard/onboarding',
  },

  callbacks: {
    async signIn({ user, account }) {
      // Allow OAuth sign in
      if (account?.provider !== 'credentials') {
        return true;
      }

      // For credentials, user must exist with password
      if (!user.email) return false;

      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
      });

      return !!existingUser?.password;
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
          select: { username: true, timezone: true, timezoneAutoDetect: true, bio: true, plan: true },
        });

        token.username = dbUser?.username ?? undefined;
        token.timezone = dbUser?.timezone ?? 'UTC';
        token.timezoneAutoDetect = dbUser?.timezoneAutoDetect ?? true;
        token.bio = dbUser?.bio ?? undefined;
        token.plan = dbUser?.plan ?? 'FREE';
        token.lastVerified = Date.now();
      }

      // Periodically verify user still exists in DB (every 5 minutes)
      const VERIFY_INTERVAL = 5 * 60 * 1000;
      const lastVerified = (token.lastVerified as number) ?? 0;

      if (token.id && Date.now() - lastVerified > VERIFY_INTERVAL) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { id: true, plan: true },
        });

        if (!dbUser) {
          return {} as any;
        }

        // Sync plan in case it changed
        token.plan = dbUser.plan ?? 'FREE';
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
      }
      return session;
    },
  },

  events: {
    async createUser({ user }) {
      // Generate a default username from email (for ALL providers including OAuth)
      if (user.email) {
        const username = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

        // Ensure uniqueness
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

      // Create default availability schedule
      const schedule = await prisma.availabilitySchedule.create({
        data: {
          userId: user.id,
          name: 'Working Hours',
          isDefault: true,
          timezone: 'UTC',
          slots: {
            create: [
              // Monday - Friday, 9am - 5pm
              { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
              { dayOfWeek: 2, startTime: '09:00', endTime: '17:00' },
              { dayOfWeek: 3, startTime: '09:00', endTime: '17:00' },
              { dayOfWeek: 4, startTime: '09:00', endTime: '17:00' },
              { dayOfWeek: 5, startTime: '09:00', endTime: '17:00' },
            ],
          },
        },
      });

      // Create default event type linked to the schedule
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
    lastVerified?: number;
    accessToken?: string;
    refreshToken?: string;
    provider?: string;
  }
}
