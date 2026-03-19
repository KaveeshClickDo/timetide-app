import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { voluntaryUnsubscribe } from '@/lib/subscription-lifecycle'
import prisma from '@/lib/prisma'

/**
 * POST /api/billing/cancel
 *
 * Cancel the user's subscription. Features remain active until planExpiresAt.
 * Background job handles the transition to grace period when the period ends.
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Read from DB (not session)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true, subscriptionStatus: true, planExpiresAt: true },
    })

    if (!user || user.subscriptionStatus !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'No active subscription to cancel' },
        { status: 400 },
      )
    }

    if (user.plan === 'FREE') {
      return NextResponse.json(
        { error: 'Free plan cannot be cancelled' },
        { status: 400 },
      )
    }

    // Transition: ACTIVE → UNSUBSCRIBED
    await voluntaryUnsubscribe(session.user.id, 'user')

    return NextResponse.json({
      success: true,
      expiresAt: user.planExpiresAt?.toISOString() ?? null,
      message: user.planExpiresAt
        ? `Subscription cancelled. Your ${user.plan} features remain active until ${user.planExpiresAt.toLocaleDateString()}.`
        : 'Subscription cancelled.',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel subscription'
    console.error('Cancel subscription error:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
