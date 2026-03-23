import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import {
  scheduleDowngrade,
  cancelScheduledDowngrade,
  SubscriptionInvalidPlanError,
  SubscriptionNotDowngradeError,
} from '@/server/services/billing'

// POST - Schedule a plan downgrade at billing period end
export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const { plan } = (await req.json()) as { plan?: string }
    const result = await scheduleDowngrade({ userId: session.user.id, plan: plan ?? '' })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof SubscriptionInvalidPlanError || error instanceof SubscriptionNotDowngradeError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Schedule downgrade error:', error)
    return NextResponse.json({ error: 'Failed to schedule downgrade' }, { status: 400 })
  }
}

// DELETE - Cancel a scheduled downgrade
export async function DELETE() {
  const { error: authError, session } = await requireAuth()
  if (authError) return authError

  try {
    await cancelScheduledDowngrade(session.user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Cancel downgrade error:', error)
    return NextResponse.json({ error: 'Failed to cancel downgrade' }, { status: 400 })
  }
}
