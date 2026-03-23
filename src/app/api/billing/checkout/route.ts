import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import {
  createCheckoutSession,
  CheckoutInvalidPlanError,
  CheckoutPlanNotAvailableError,
  CheckoutUserEmailMissingError,
  CheckoutAlreadyOnPlanError,
  CheckoutDowngradingError,
  CheckoutUseUpgradeError,
  CheckoutUseDowngradeError,
} from '@/server/services/billing'

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const { plan } = (await req.json()) as { plan?: string }
    const result = await createCheckoutSession({ userId: session.user.id, plan: plan ?? '' })
    return NextResponse.json({ url: result.url })
  } catch (error) {
    if (
      error instanceof CheckoutInvalidPlanError ||
      error instanceof CheckoutPlanNotAvailableError ||
      error instanceof CheckoutUserEmailMissingError ||
      error instanceof CheckoutAlreadyOnPlanError ||
      error instanceof CheckoutDowngradingError ||
      error instanceof CheckoutUseUpgradeError ||
      error instanceof CheckoutUseDowngradeError
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Checkout session error:', error)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
