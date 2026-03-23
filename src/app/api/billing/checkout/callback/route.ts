import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import {
  processCheckoutCallback,
  CheckoutMissingSessionIdError,
  CheckoutPaymentNotCompletedError,
  CheckoutSessionMismatchError,
  CheckoutInvalidPlanMetadataError,
} from '@/server/services/billing'

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const { sessionId } = (await req.json()) as { sessionId?: string }
    const result = await processCheckoutCallback({
      userId: session.user.id,
      sessionId: sessionId ?? '',
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof CheckoutMissingSessionIdError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof CheckoutPaymentNotCompletedError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof CheckoutSessionMismatchError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof CheckoutInvalidPlanMetadataError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Checkout callback error:', error)
    return NextResponse.json({ error: 'Failed to process checkout' }, { status: 500 })
  }
}
