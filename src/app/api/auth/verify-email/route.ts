import { NextRequest, NextResponse } from 'next/server'
import {
  checkVerifyToken,
  verifyEmail,
  AuthInvalidTokenError,
  AuthTokenExpiredError,
  AuthUserNotFoundError,
} from '@/server/services/auth'
import { z } from 'zod'

const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
})

// GET - Check if token is valid
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    const result = await checkVerifyToken(token || '')
    if (!result.valid) {
      return NextResponse.json({ valid: false, error: result.error }, { status: 400 })
    }
    return NextResponse.json({ valid: true })
  } catch (error) {
    console.error('Verify email check error:', error)
    return NextResponse.json({ valid: false, error: 'Something went wrong' }, { status: 500 })
  }
}

// POST - Verify the email
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const result = verifyEmailSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const response = await verifyEmail(result.data.token)
    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof AuthInvalidTokenError || error instanceof AuthTokenExpiredError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof AuthUserNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('Verify email error:', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
