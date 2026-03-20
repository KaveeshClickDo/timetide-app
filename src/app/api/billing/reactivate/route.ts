import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * POST /api/billing/reactivate
 *
 * Reactivate a cancelled subscription (UNSUBSCRIBED → ACTIVE).
 * Only works if user still has time left in their billing period.
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true, subscriptionStatus: true, planExpiresAt: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (user.subscriptionStatus !== 'UNSUBSCRIBED') {
      return NextResponse.json(
        { error: 'Only cancelled subscriptions can be reactivated' },
        { status: 400 },
      )
    }

    if (user.plan === 'FREE') {
      return NextResponse.json(
        { error: 'No subscription to reactivate' },
        { status: 400 },
      )
    }

    // Must have remaining time in billing period
    if (!user.planExpiresAt || user.planExpiresAt <= new Date()) {
      return NextResponse.json(
        { error: 'Billing period has expired. Please subscribe again.' },
        { status: 400 },
      )
    }

    // Atomic: only update if still UNSUBSCRIBED (prevents race conditions)
    const result = await prisma.user.updateMany({
      where: { id: session.user.id, subscriptionStatus: 'UNSUBSCRIBED' },
      data: {
        subscriptionStatus: 'ACTIVE',
        downgradeReason: null,
        downgradeInitiatedBy: null,
      },
    })

    if (result.count === 0) {
      return NextResponse.json(
        { error: 'Subscription status has already changed' },
        { status: 409 },
      )
    }

    // Log history
    await prisma.subscriptionHistory.create({
      data: {
        userId: session.user.id,
        action: 'reactivate',
        fromPlan: user.plan,
        toPlan: user.plan,
        fromStatus: 'UNSUBSCRIBED',
        toStatus: 'ACTIVE',
        reason: 'User reactivated cancelled subscription',
        initiatedBy: 'user',
      },
    })

    return NextResponse.json({
      success: true,
      message: `Your ${user.plan} subscription has been reactivated! It will renew on ${user.planExpiresAt.toLocaleDateString()}.`,
    })
  } catch (error) {
    console.error('Reactivate error:', error)
    return NextResponse.json({ error: 'Failed to reactivate subscription' }, { status: 500 })
  }
}
