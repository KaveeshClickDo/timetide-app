import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { stripe, getCustomerPaymentMethod } from '@/lib/stripe'
import { type PlanTier } from '@/lib/pricing'
import { getPlanConfig } from '@/lib/pricing-server'
import { activateSubscription } from '@/lib/subscription-lifecycle'
import { queuePaymentSuccessEmail } from '@/lib/infrastructure/queue/email-queue'
import prisma from '@/lib/prisma'

/**
 * POST /api/billing/recover-checkout
 *
 * Recovers unprocessed Stripe Checkout sessions.
 * Handles edge cases where:
 *   - User paid but browser closed before redirect
 *   - Redirect happened but callback API failed
 *   - Network issue during callback
 *
 * Called by billing page on mount and by a background job.
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get user's Stripe customer ID
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        stripeCustomerId: true,
        plan: true,
        subscriptionStatus: true,
        name: true,
        email: true,
      },
    })

    if (!user?.stripeCustomerId) {
      return NextResponse.json({ recovered: false, reason: 'no_customer' })
    }

    // If user is already on a paid plan with ACTIVE status, nothing to recover
    if (user.plan !== 'FREE' && user.subscriptionStatus === 'ACTIVE') {
      return NextResponse.json({ recovered: false, reason: 'already_active' })
    }

    // List recent completed checkout sessions for this customer (last 24h)
    const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000)
    const sessions = await stripe.checkout.sessions.list({
      customer: user.stripeCustomerId,
      status: 'complete',
      created: { gte: oneDayAgo },
      limit: 5,
      expand: ['data.payment_intent'],
    })

    // Find sessions that we haven't processed yet
    for (const checkoutSession of sessions.data) {
      // Must be a payment-mode session with our metadata
      if (checkoutSession.mode !== 'payment') continue
      if (checkoutSession.metadata?.userId !== session.user.id) continue
      if (checkoutSession.payment_status !== 'paid') continue

      const planTier = checkoutSession.metadata?.planTier as PlanTier
      if (!planTier || !['PRO', 'TEAM'].includes(planTier)) continue

      // Check if we already have a Payment record for this PaymentIntent
      const paymentIntent = checkoutSession.payment_intent as import('stripe').Stripe.PaymentIntent | null
      if (!paymentIntent?.id) continue

      const existingPayment = await prisma.payment.findUnique({
        where: { stripePaymentIntentId: paymentIntent.id },
      })

      if (existingPayment) continue // Already processed

      // Found an unprocessed paid session — recover it
      console.log(`[recover-checkout] Recovering session ${checkoutSession.id} for user ${session.user.id}, plan ${planTier}`)

      const planConfig = await getPlanConfig(planTier)
      const intervalDays = planConfig?.intervalDays ?? 30

      // Activate the subscription
      await activateSubscription(session.user.id, planTier, intervalDays, 'stripe')

      // Save payment method
      if (typeof paymentIntent.payment_method === 'string') {
        try {
          await stripe.customers.update(user.stripeCustomerId, {
            invoice_settings: { default_payment_method: paymentIntent.payment_method },
          })
          await prisma.user.update({
            where: { id: session.user.id },
            data: {
              stripePaymentMethodId: paymentIntent.payment_method,
              lastPaymentAt: new Date(),
            },
          })
        } catch (err) {
          console.error('[recover-checkout] Failed to set default payment method:', err)
        }
      }

      // Record the payment
      const now = new Date()
      const periodEnd = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000)

      const payment = await prisma.payment.create({
        data: {
          userId: session.user.id,
          amount: checkoutSession.amount_total ?? 0,
          currency: checkoutSession.currency ?? 'usd',
          status: 'succeeded',
          stripePaymentIntentId: paymentIntent.id,
          stripeChargeId: typeof paymentIntent.latest_charge === 'string'
            ? paymentIntent.latest_charge
            : paymentIntent.latest_charge?.id ?? null,
          planTier,
          type: 'initial',
          billingPeriodStart: now,
          billingPeriodEnd: periodEnd,
        },
      })

      // Send invoice email
      if (user.email) {
        const cardInfo = await getCustomerPaymentMethod(user.stripeCustomerId).catch(() => null)
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

      return NextResponse.json({
        recovered: true,
        plan: planTier,
        message: `Your ${planTier} plan has been activated.`,
      })
    }

    // No unprocessed sessions found
    return NextResponse.json({ recovered: false, reason: 'nothing_to_recover' })
  } catch (error) {
    console.error('Recover checkout error:', error)
    return NextResponse.json({ error: 'Failed to recover checkout' }, { status: 500 })
  }
}
