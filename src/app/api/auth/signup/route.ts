import { NextResponse } from 'next/server'
import { signUpSchema } from '@/server/validation/schemas'
import { checkAuthRateLimit } from '@/server/infrastructure/queue/rate-limiter'
import { signup, AuthUserAlreadyExistsError } from '@/server/services/auth'

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const { allowed, resetAt } = await checkAuthRateLimit(`signup:${ip}`)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)) } }
      )
    }

    const body = await request.json()
    const result = signUpSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 })
    }

    const signupResult = await signup(result.data)
    return NextResponse.json({ success: true, ...signupResult })
  } catch (error) {
    if (error instanceof AuthUserAlreadyExistsError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Signup error:', error)
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
  }
}
