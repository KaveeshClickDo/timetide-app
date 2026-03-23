import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import {
  processPaymentMethodCallback,
  PaymentMethodMissingSessionIdError,
  PaymentMethodSessionMismatchError,
  PaymentMethodInvalidSessionTypeError,
  PaymentMethodNoSetupIntentError,
  PaymentMethodNotFoundError,
} from '@/server/services/billing'

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const { sessionId } = await req.json()
    await processPaymentMethodCallback({
      userId: session.user.id,
      sessionId: sessionId ?? '',
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof PaymentMethodSessionMismatchError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (
      error instanceof PaymentMethodMissingSessionIdError ||
      error instanceof PaymentMethodInvalidSessionTypeError ||
      error instanceof PaymentMethodNoSetupIntentError ||
      error instanceof PaymentMethodNotFoundError
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Update payment method callback error:', error)
    return NextResponse.json({ error: 'Failed to update payment method' }, { status: 500 })
  }
}
