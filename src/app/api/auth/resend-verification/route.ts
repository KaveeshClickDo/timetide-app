import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkAuthRateLimit } from '@/server/infrastructure/queue/rate-limiter'
import { resendVerification } from '@/server/services/auth'

const resendSchema = z.object({
  email: z.string().email('Invalid email address'),
})

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rateLimitResult = await checkAuthRateLimit(ip)
    if (!rateLimitResult.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
    }

    const body = await request.json()
    const result = resendSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    const response = await resendVerification(result.data.email)
    return NextResponse.json(response)
  } catch (error) {
    console.error('Resend verification error:', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
