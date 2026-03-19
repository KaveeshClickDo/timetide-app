import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { voluntaryUnsubscribe, scheduleUserDowngrade, cancelDowngrade } from '@/lib/subscription-lifecycle'
import { stripe } from '@/lib/stripe'
import prisma from '@/lib/prisma'
import type { PlanTier } from '@/lib/pricing'

const TIER_ORDER: PlanTier[] = ['FREE', 'PRO', 'TEAM']

/**
 * POST - Schedule a plan downgrade at billing period end.
 * User keeps current plan features until period ends, then switches to targetPlan.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { plan } = (await req.json()) as { plan?: string }

    if (!plan || !['FREE', 'PRO', 'TEAM'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const targetPlan = plan as PlanTier

    // Read plan from DB (not session) to prevent stale JWT bypass
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true, subscriptionStatus: true },
    })
    const currentPlan = (dbUser?.plan as PlanTier) || 'FREE'

    // Must be a downgrade (or same plan re-subscribe at lower tier handled elsewhere)
    if (TIER_ORDER.indexOf(targetPlan) >= TIER_ORDER.indexOf(currentPlan)) {
      return NextResponse.json({ error: 'This endpoint is for downgrades only' }, { status: 400 })
    }

    // If user is still ACTIVE, unsubscribe first (ACTIVE → UNSUBSCRIBED)
    // scheduleUserDowngrade requires UNSUBSCRIBED status
    if (dbUser?.subscriptionStatus === 'ACTIVE') {
      await voluntaryUnsubscribe(session.user.id, 'user')
    }

    const { switchDate } = await scheduleUserDowngrade(session.user.id, targetPlan)

    // Sync with Stripe: schedule cancellation at period end (if not already)
    let stripeSyncFailed = false
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { stripeSubscriptionId: true },
    })
    if (user?.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.update(user.stripeSubscriptionId, {
          cancel_at_period_end: true,
        })
      } catch (err: unknown) {
        console.error('[schedule-downgrade] Stripe sync failed:', err)
        stripeSyncFailed = true
      }
    }

    return NextResponse.json({
      success: true,
      switchDate: switchDate.toISOString(),
      message: `Your plan will switch to ${targetPlan} on ${switchDate.toLocaleDateString()}`,
      ...(stripeSyncFailed && { warning: 'Plan switch scheduled, but billing sync may be delayed. Contact support if you are charged unexpectedly.' }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to schedule downgrade'
    console.error('Schedule downgrade error:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

/**
 * DELETE - Cancel a scheduled downgrade.
 */
export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await cancelDowngrade(session.user.id, 'user')

    // Sync with Stripe: remove cancellation
    let stripeSyncFailed = false
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { stripeSubscriptionId: true },
    })
    if (user?.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.update(user.stripeSubscriptionId, {
          cancel_at_period_end: false,
        })
      } catch (err: unknown) {
        console.error('[schedule-downgrade] Stripe cancel sync failed:', err)
        stripeSyncFailed = true
      }
    }

    return NextResponse.json({
      success: true,
      ...(stripeSyncFailed && { warning: 'Plan switch cancelled, but billing sync may be delayed. Contact support if issues persist.' }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel downgrade'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
