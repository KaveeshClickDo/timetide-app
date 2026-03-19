import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { stripe } from '@/lib/stripe'
import { type PlanTier } from '@/lib/pricing'
import { getPlanConfig } from '@/lib/pricing-server'
import { activateSubscription } from '@/lib/subscription-lifecycle'
import { getCustomerPaymentMethod } from '@/lib/stripe'
import { queuePaymentSuccessEmail } from '@/lib/infrastructure/queue/email-queue'
import prisma from '@/lib/prisma'

/**
 * POST /api/billing/checkout/callback
 *
 * Called by the billing page after Stripe Checkout redirect.
 * Verifies the payment, activates the plan, and records the payment.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { sessionId } = (await req.json()) as { sessionId?: string }

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session ID' }, { status: 400 })
    }

    // Retrieve the Stripe Checkout session
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    })

    // Verify payment status
    if (checkoutSession.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 400 })
    }

    // Verify the session belongs to this user
    if (checkoutSession.metadata?.userId !== session.user.id) {
      return NextResponse.json({ error: 'Session does not belong to this user' }, { status: 403 })
    }

    const planTier = checkoutSession.metadata?.planTier as PlanTier
    if (!planTier || !['PRO', 'TEAM'].includes(planTier)) {
      return NextResponse.json({ error: 'Invalid plan in session metadata' }, { status: 400 })
    }

    // Check if this session was already processed (idempotency)
    const paymentIntent = checkoutSession.payment_intent as import('stripe').Stripe.PaymentIntent | null
    if (paymentIntent?.id) {
      const existingPayment = await prisma.payment.findUnique({
        where: { stripePaymentIntentId: paymentIntent.id },
      })
      if (existingPayment) {
        // Already processed — return success without double-activating
        return NextResponse.json({ success: true, alreadyProcessed: true })
      }
    }

    // Fetch plan config for interval
    const planConfig = await getPlanConfig(planTier)
    const intervalDays = planConfig?.intervalDays ?? 30

    // Activate the subscription in our system
    await activateSubscription(session.user.id, planTier, intervalDays, 'stripe')

    // Save payment method and last payment time
    const updateData: Record<string, unknown> = {
      lastPaymentAt: new Date(),
    }

    // Extract and save the payment method for future recurring charges
    if (paymentIntent && typeof paymentIntent.payment_method === 'string') {
      updateData.stripePaymentMethodId = paymentIntent.payment_method

      // Also set as customer's default payment method for off-session charges
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { stripeCustomerId: true },
      })
      if (user?.stripeCustomerId) {
        try {
          await stripe.customers.update(user.stripeCustomerId, {
            invoice_settings: { default_payment_method: paymentIntent.payment_method as string },
          })
        } catch (err) {
          console.error('[checkout-callback] Failed to set default payment method:', err)
        }
      }
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
    })

    // Record the payment
    const now = new Date()
    const periodEnd = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000)

    const payment = await prisma.payment.create({
      data: {
        userId: session.user.id,
        amount: checkoutSession.amount_total ?? 0,
        currency: checkoutSession.currency ?? 'usd',
        status: 'succeeded',
        stripePaymentIntentId: paymentIntent?.id ?? null,
        stripeChargeId: paymentIntent?.latest_charge
          ? (typeof paymentIntent.latest_charge === 'string' ? paymentIntent.latest_charge : paymentIntent.latest_charge.id)
          : null,
        planTier,
        type: 'initial',
        billingPeriodStart: now,
        billingPeriodEnd: periodEnd,
      },
    })

    // Send invoice email
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true, stripeCustomerId: true },
    })
    if (user?.email) {
      const cardInfo = user.stripeCustomerId
        ? await getCustomerPaymentMethod(user.stripeCustomerId).catch(() => null)
        : null
      const invoiceNum = `TT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${payment.id.slice(-6).toUpperCase()}`
      queuePaymentSuccessEmail({
        userName: user.name || 'there',
        userEmail: user.email,
        planName: planConfig?.name ?? planTier,
        planTier,
        amount: payment.amount,
        currency: payment.currency,
        invoiceNumber: invoiceNum,
        paymentDate: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        billingPeriodStart: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        billingPeriodEnd: periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        cardLast4: cardInfo?.last4,
        cardBrand: cardInfo?.brand,
        paymentType: 'initial',
        updatePaymentUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
        billingUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
      }).catch(console.error)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Checkout callback error:', error)
    return NextResponse.json({ error: 'Failed to process checkout' }, { status: 500 })
  }
}
