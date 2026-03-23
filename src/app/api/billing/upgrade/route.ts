import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import {
  upgradePlan,
  UpgradeInvalidPlanError,
  UpgradeUserNotFoundError,
  UpgradeNotActiveError,
  UpgradeNotHigherTierError,
  UpgradeNoPaymentMethodError,
  UpgradePlanConfigError,
  UpgradePaymentFailedError,
} from '@/server/services/billing'

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const { plan } = (await req.json()) as { plan?: string }
    const result = await upgradePlan({
      userId: session.user.id,
      userName: session.user.name ?? null,
      userEmail: session.user.email,
      plan: plan ?? '',
    })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof UpgradeInvalidPlanError || error instanceof UpgradeNotActiveError || error instanceof UpgradeNotHigherTierError || error instanceof UpgradeNoPaymentMethodError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof UpgradeUserNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof UpgradePlanConfigError) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (error instanceof UpgradePaymentFailedError) {
      return NextResponse.json({ error: error.message }, { status: 402 })
    }
    console.error('Upgrade error:', error)
    return NextResponse.json({ error: 'Failed to upgrade plan' }, { status: 500 })
  }
}
