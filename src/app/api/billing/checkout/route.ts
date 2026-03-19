import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { stripe, getOrCreateStripeCustomer, STRIPE_PRICE_MAP, getSubscriptionItemId } from '@/lib/stripe'
import prisma from '@/lib/prisma'
import type { PlanTier } from '@/lib/pricing'

const TIER_ORDER: PlanTier[] = ['FREE', 'PRO', 'TEAM']

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { plan } = (await req.json()) as { plan?: string }

    if (!plan || !['PRO', 'TEAM'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan. Must be PRO or TEAM.' }, { status: 400 })
    }

    const targetPlan = plan as PlanTier
    const priceId = STRIPE_PRICE_MAP[targetPlan]

    if (!priceId) {
      return NextResponse.json({ error: 'Stripe price not configured for this plan' }, { status: 500 })
    }

    // Read plan and status from DB (not session) to prevent stale JWT bypass
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, name: true, stripeSubscriptionId: true, plan: true, subscriptionStatus: true },
    })

    const currentPlan = (user?.plan as PlanTier) || 'FREE'
    const subscriptionStatus = user?.subscriptionStatus as string | undefined
    const isDowngrade = TIER_ORDER.indexOf(targetPlan) < TIER_ORDER.indexOf(currentPlan)

    // Block downgrades only when user has an active/cancelled subscription
    // GRACE_PERIOD, LOCKED, NONE users can subscribe to any plan (no active subscription)
    const hasSubscription = subscriptionStatus === 'ACTIVE' || subscriptionStatus === 'UNSUBSCRIBED'
    if (isDowngrade && hasSubscription) {
      return NextResponse.json(
        { error: 'Use the schedule-downgrade endpoint for downgrades' },
        { status: 400 },
      )
    }

    // Block DOWNGRADING users — must cancel scheduled switch first
    if (subscriptionStatus === 'DOWNGRADING') {
      return NextResponse.json(
        { error: 'Cancel your scheduled plan switch before changing plans' },
        { status: 400 },
      )
    }

    // Block same-plan if actively subscribed
    if (currentPlan === targetPlan && subscriptionStatus === 'ACTIVE') {
      return NextResponse.json({ error: 'Already on this plan' }, { status: 400 })
    }

    if (!user?.email) {
      return NextResponse.json({ error: 'User email not found' }, { status: 400 })
    }

    const customerId = await getOrCreateStripeCustomer(
      session.user.id,
      user.email,
      user.name,
    )

    // If user has an existing subscription in DB, update it (upgrade or re-activate same plan)
    if (user.stripeSubscriptionId) {
      const itemId = await getSubscriptionItemId(user.stripeSubscriptionId)
      if (itemId) {
        await stripe.subscriptions.update(user.stripeSubscriptionId, {
          items: [{ id: itemId, price: priceId }],
          cancel_at_period_end: false,
          proration_behavior: 'always_invoice',
        })
        return NextResponse.json({ url: '/dashboard/billing?success=true' })
      }
    }

    // Safety check: query Stripe directly for active subscriptions on this customer
    // Prevents duplicate subscriptions from concurrent requests (multiple tabs, etc.)
    const existingSubs = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    })
    if (existingSubs.data.length > 0) {
      const existingSub = existingSubs.data[0]
      const existingItemId = existingSub.items.data[0]?.id
      if (existingItemId) {
        // Sync the subscription ID back to our DB (may have been missed)
        await prisma.user.update({
          where: { id: session.user.id },
          data: { stripeSubscriptionId: existingSub.id },
        })
        await stripe.subscriptions.update(existingSub.id, {
          items: [{ id: existingItemId, price: priceId }],
          cancel_at_period_end: false,
          proration_behavior: 'always_invoice',
        })
        return NextResponse.json({ url: '/dashboard/billing?success=true' })
      }
    }

    // Create new checkout session (new subscription) — no existing subscription found
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard/billing?success=true`,
      cancel_url: `${appUrl}/dashboard/billing?canceled=true`,
      metadata: {
        userId: session.user.id,
        plan: targetPlan,
      },
      subscription_data: {
        metadata: {
          userId: session.user.id,
          plan: targetPlan,
        },
      },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    console.error('Checkout session error:', error)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
