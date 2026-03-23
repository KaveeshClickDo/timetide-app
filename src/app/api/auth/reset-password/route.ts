import { NextResponse } from 'next/server'
import { z } from 'zod'
import { passwordSchema } from '@/server/validation/schemas'
import {
  resetPassword,
  AuthInvalidTokenError,
  AuthTokenExpiredError,
  AuthUserNotFoundError,
} from '@/server/services/auth'

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: passwordSchema,
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const result = resetPasswordSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: result.error.errors[0]?.message || 'Invalid input' }, { status: 400 })
    }

    const response = await resetPassword(result.data.token, result.data.password)
    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof AuthInvalidTokenError || error instanceof AuthTokenExpiredError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof AuthUserNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('Reset password error:', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
