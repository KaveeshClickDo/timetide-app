import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/admin-auth'
import { voluntaryUnsubscribe, scheduleUserDowngrade, cancelDowngrade } from '@/lib/subscription-lifecycle'
import prisma from '@/lib/prisma'
import type { PlanTier } from '@/lib/pricing'

const TIER_ORDER: PlanTier[] = ['FREE', 'PRO', 'TEAM']

/**
 * POST - Schedule a plan downgrade at billing period end.
 * User keeps current plan features until period ends, then switches to targetPlan.
 */
export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const { plan } = (await req.json()) as { plan?: string }

    if (!plan || !['FREE', 'PRO', 'TEAM'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const targetPlan = plan as PlanTier

    // Read plan from DB (not session)
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true, subscriptionStatus: true },
    })
    const currentPlan = (dbUser?.plan as PlanTier) || 'FREE'

    // Must be a downgrade
    if (TIER_ORDER.indexOf(targetPlan) >= TIER_ORDER.indexOf(currentPlan)) {
      return NextResponse.json({ error: 'This endpoint is for downgrades only' }, { status: 400 })
    }

    // If user is still ACTIVE, unsubscribe first (ACTIVE → UNSUBSCRIBED)
    if (dbUser?.subscriptionStatus === 'ACTIVE') {
      await voluntaryUnsubscribe(session.user.id, 'user')
    }

    const { switchDate } = await scheduleUserDowngrade(session.user.id, targetPlan)

    return NextResponse.json({
      success: true,
      switchDate: switchDate.toISOString(),
      message: `Your plan will switch to ${targetPlan} on ${switchDate.toLocaleDateString()}`,
    })
  } catch (error) {
    console.error('Schedule downgrade error:', error)
    return NextResponse.json({ error: 'Failed to schedule downgrade' }, { status: 400 })
  }
}

/**
 * DELETE - Cancel a scheduled downgrade.
 */
export async function DELETE() {
  const { error: authError, session } = await requireAuth()
  if (authError) return authError

  try {
    await cancelDowngrade(session.user.id, 'user')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Cancel downgrade error:', error)
    return NextResponse.json({ error: 'Failed to cancel downgrade' }, { status: 400 })
  }
}
