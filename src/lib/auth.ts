/**
 * NextAuth Configuration for TimeTide
 * Supports: Google OAuth, GitHub OAuth, Email/Password
 */

import { NextAuthOptions } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
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
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
        },
      },
    }),

    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
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
    signIn: '/login',
    signOut: '/login',
    error: '/login',
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

    // In auth.ts
    async jwt({ token, user, account, trigger, session }) {
      // Handle session updates
      if (trigger === 'update' && session) {
        return { ...token, ...session.user }
      }

      if (user) {
        token.id = user.id;

        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { username: true, timezone: true, bio: true },
        });

        token.username = dbUser?.username ?? undefined;
        token.timezone = dbUser?.timezone ?? 'UTC';
        token.bio = dbUser?.bio ?? undefined;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.username = token.username as string | undefined;
        session.user.timezone = token.timezone as string;
        session.user.bio = token.bio as string | undefined; 
      }
      return session;
    },
  },

  events: {
    async createUser({ user }) {
      // Generate a default username from email
      if (user.email && !user.name) {
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
      await prisma.availabilitySchedule.create({
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
      bio?: string;
    };
  }

  interface User {
    username?: string;
    timezone?: string;
    bio?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    username?: string;
    timezone: string;
    bio?: string;
    accessToken?: string;
    refreshToken?: string;
    provider?: string;
  }
}
