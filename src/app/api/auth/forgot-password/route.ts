import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkAuthRateLimit } from '@/server/infrastructure/queue/rate-limiter'
import { forgotPassword } from '@/server/services/auth'

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
})

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const { allowed, resetAt } = await checkAuthRateLimit(`forgot:${ip}`)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)) } }
      )
    }

    const body = await request.json()
    const result = forgotPasswordSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    const response = await forgotPassword(result.data.email)
    return NextResponse.json(response)
  } catch (error) {
    console.error('Forgot password error:', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
