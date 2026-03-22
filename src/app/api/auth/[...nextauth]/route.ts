import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { checkAuthRateLimit } from '@/lib/infrastructure/queue/rate-limiter'

const handler = NextAuth(authOptions)

export { handler as GET }

export async function POST(request: Request, context: { params: { nextauth: string[] } }) {
  // Rate limit credentials sign-in attempts
  const { nextauth } = context.params
  const isCredentialsCallback =
    nextauth?.includes('callback') && nextauth?.includes('credentials')

  if (isCredentialsCallback) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const { allowed, resetAt } = await checkAuthRateLimit(`login:${ip}`)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)) } }
      )
    }
  }

  return handler(request, context)
}
