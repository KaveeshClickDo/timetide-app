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

    const currentPlan = (session.user.plan as PlanTier) || 'FREE'

    // Don't allow subscribing to same plan
    if (currentPlan === targetPlan) {
      return NextResponse.json({ error: 'Already on this plan' }, { status: 400 })
    }

    // Don't allow downgrade via checkout — use portal or admin
    if (TIER_ORDER.indexOf(targetPlan) < TIER_ORDER.indexOf(currentPlan)) {
      return NextResponse.json(
        { error: 'Downgrades are managed through the subscription portal' },
        { status: 400 },
      )
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, name: true, stripeSubscriptionId: true },
    })

    if (!user?.email) {
      return NextResponse.json({ error: 'User email not found' }, { status: 400 })
    }

    const customerId = await getOrCreateStripeCustomer(
      session.user.id,
      user.email,
      user.name,
    )

    // If user already has an active subscription, update the price instead of creating new checkout
    if (user.stripeSubscriptionId) {
      const itemId = await getSubscriptionItemId(user.stripeSubscriptionId)
      if (itemId) {
        await stripe.subscriptions.update(user.stripeSubscriptionId, {
          items: [{ id: itemId, price: priceId }],
          proration_behavior: 'always_invoice',
        })
        return NextResponse.json({ url: '/dashboard/billing?success=true' })
      }
    }

    // Create new checkout session
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
