import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { stripe, getOrCreateStripeCustomer } from '@/lib/stripe'
import { type PlanTier } from '@/lib/pricing'
import { getPlanConfig } from '@/lib/pricing-server'
import prisma from '@/lib/prisma'

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

    // Fetch plan config from DB
    const planConfig = await getPlanConfig(targetPlan)
    if (!planConfig || !planConfig.isActive) {
      return NextResponse.json({ error: 'Plan not available' }, { status: 400 })
    }

    // Read current state from DB (not session) to prevent stale JWT bypass
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, name: true, plan: true, subscriptionStatus: true, stripeCustomerId: true },
    })

    if (!user?.email) {
      return NextResponse.json({ error: 'User email not found' }, { status: 400 })
    }

    const currentPlan = (user.plan as PlanTier) || 'FREE'
    const subscriptionStatus = user.subscriptionStatus as string | undefined

    // Block same-plan if actively subscribed
    if (currentPlan === targetPlan && subscriptionStatus === 'ACTIVE') {
      return NextResponse.json({ error: 'Already on this plan' }, { status: 400 })
    }

    // Block same-plan re-subscribe when cancelled — user should reactivate instead (no charge)
    if (currentPlan === targetPlan && subscriptionStatus === 'UNSUBSCRIBED') {
      return NextResponse.json(
        { error: 'Your subscription is still active until your billing period ends. Use the Reactivate button instead.' },
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

    // Upgrades are handled via /api/billing/upgrade (separate endpoint)
    const isUpgrade = subscriptionStatus === 'ACTIVE' && currentPlan !== 'FREE' && TIER_ORDER.indexOf(targetPlan) > TIER_ORDER.indexOf(currentPlan)
    if (isUpgrade) {
      return NextResponse.json(
        { error: 'Use the upgrade endpoint for plan upgrades' },
        { status: 400 },
      )
    }

    // Downgrades are handled via /api/billing/schedule-downgrade
    const isDowngrade = TIER_ORDER.indexOf(targetPlan) < TIER_ORDER.indexOf(currentPlan)
    const hasSubscription = subscriptionStatus === 'ACTIVE' || subscriptionStatus === 'UNSUBSCRIBED'
    if (isDowngrade && hasSubscription) {
      return NextResponse.json(
        { error: 'Use the schedule-downgrade endpoint for downgrades' },
        { status: 400 },
      )
    }

    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(
      session.user.id,
      user.email,
      user.name,
    )

    // Create Stripe Checkout session — one-time payment that saves card
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      payment_intent_data: {
        setup_future_usage: 'off_session',
        metadata: {
          userId: session.user.id,
          planTier: targetPlan,
          type: 'initial',
        },
      },
      line_items: [{
        price_data: {
          currency: planConfig.currency,
          unit_amount: planConfig.price,
          product_data: {
            name: `TimeTide ${planConfig.name} Plan`,
            description: `${planConfig.name} plan — ${planConfig.intervalDays}-day billing cycle`,
          },
        },
        quantity: 1,
      }],
      success_url: `${appUrl}/dashboard/billing?success=true&plan=${targetPlan}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/dashboard/billing?canceled=true`,
      metadata: {
        userId: session.user.id,
        planTier: targetPlan,
        type: 'initial',
      },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    console.error('Checkout session error:', error)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
