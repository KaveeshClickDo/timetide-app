/**
 * Checkout flow: create session, process callback, recover unprocessed sessions.
 *
 * Handles: plan validation, Stripe Checkout creation, payment verification,
 * idempotent activation, payment method saving, and invoice recording.
 */

import prisma from '@/server/db/prisma'
import { stripe, getOrCreateStripeCustomer, extractChargeId, recordPaymentAndNotify } from '@/server/billing/stripe'
import { TIER_ORDER, PAID_PLANS, type PlanTier } from '@/lib/pricing'
import { getPlanConfig } from '@/server/billing/pricing-server'
import { activateSubscription } from '@/server/billing/subscription-lifecycle'

// ── Domain errors ─────────────────────────────────────────────────────────────

export class CheckoutInvalidPlanError extends Error {
  constructor(message = 'Invalid plan. Must be PRO or TEAM.') {
    super(message)
    this.name = 'CheckoutInvalidPlanError'
  }
}

export class CheckoutPlanNotAvailableError extends Error {
  constructor() {
    super('Plan not available')
    this.name = 'CheckoutPlanNotAvailableError'
  }
}

export class CheckoutUserEmailMissingError extends Error {
  constructor() {
    super('User email not found')
    this.name = 'CheckoutUserEmailMissingError'
  }
}

export class CheckoutAlreadyOnPlanError extends Error {
  constructor(message = 'Already on this plan') {
    super(message)
    this.name = 'CheckoutAlreadyOnPlanError'
  }
}

export class CheckoutDowngradingError extends Error {
  constructor() {
    super('Cancel your scheduled plan switch before changing plans')
    this.name = 'CheckoutDowngradingError'
  }
}

export class CheckoutUseUpgradeError extends Error {
  constructor() {
    super('Use the upgrade endpoint for plan upgrades')
    this.name = 'CheckoutUseUpgradeError'
  }
}

export class CheckoutUseDowngradeError extends Error {
  constructor() {
    super('Use the schedule-downgrade endpoint for downgrades')
    this.name = 'CheckoutUseDowngradeError'
  }
}

export class CheckoutMissingSessionIdError extends Error {
  constructor() {
    super('Missing session ID')
    this.name = 'CheckoutMissingSessionIdError'
  }
}

export class CheckoutPaymentNotCompletedError extends Error {
  constructor() {
    super('Payment not completed')
    this.name = 'CheckoutPaymentNotCompletedError'
  }
}

export class CheckoutSessionMismatchError extends Error {
  constructor() {
    super('Session does not belong to this user')
    this.name = 'CheckoutSessionMismatchError'
  }
}

export class CheckoutInvalidPlanMetadataError extends Error {
  constructor() {
    super('Invalid plan in session metadata')
    this.name = 'CheckoutInvalidPlanMetadataError'
  }
}

// ── Create checkout session ───────────────────────────────────────────────────

export interface CreateCheckoutSessionInput {
  userId: string
  plan: string
}

export interface CreateCheckoutSessionResult {
  url: string | null
}

export async function createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CreateCheckoutSessionResult> {
  const { userId, plan } = input

  if (!plan || !PAID_PLANS.includes(plan as PlanTier)) {
    throw new CheckoutInvalidPlanError()
  }

  const targetPlan = plan as PlanTier

  const planConfig = await getPlanConfig(targetPlan)
  if (!planConfig || !planConfig.isActive) {
    throw new CheckoutPlanNotAvailableError()
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, plan: true, subscriptionStatus: true, stripeCustomerId: true },
  })

  if (!user?.email) throw new CheckoutUserEmailMissingError()

  const currentPlan = (user.plan as PlanTier) || 'FREE'
  const subscriptionStatus = user.subscriptionStatus as string | undefined

  if (currentPlan === targetPlan && subscriptionStatus === 'ACTIVE') {
    throw new CheckoutAlreadyOnPlanError()
  }

  if (currentPlan === targetPlan && subscriptionStatus === 'UNSUBSCRIBED') {
    throw new CheckoutAlreadyOnPlanError(
      'Your subscription is still active until your billing period ends. Use the Reactivate button instead.'
    )
  }

  if (subscriptionStatus === 'DOWNGRADING') {
    throw new CheckoutDowngradingError()
  }

  const isUpgrade =
    subscriptionStatus === 'ACTIVE' &&
    currentPlan !== 'FREE' &&
    TIER_ORDER.indexOf(targetPlan) > TIER_ORDER.indexOf(currentPlan)
  if (isUpgrade) throw new CheckoutUseUpgradeError()

  const isDowngrade = TIER_ORDER.indexOf(targetPlan) < TIER_ORDER.indexOf(currentPlan)
  const hasSubscription = subscriptionStatus === 'ACTIVE' || subscriptionStatus === 'UNSUBSCRIBED'
  if (isDowngrade && hasSubscription) throw new CheckoutUseDowngradeError()

  const customerId = await getOrCreateStripeCustomer(userId, user.email, user.name)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    payment_intent_data: {
      setup_future_usage: 'off_session',
      metadata: { userId, planTier: targetPlan, type: 'initial' },
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
    metadata: { userId, planTier: targetPlan, type: 'initial' },
  })

  return { url: checkoutSession.url }
}

// ── Process checkout callback ─────────────────────────────────────────────────

export interface ProcessCheckoutCallbackInput {
  userId: string
  sessionId: string
}

export interface ProcessCheckoutCallbackResult {
  success: boolean
  alreadyProcessed?: boolean
}

export async function processCheckoutCallback(
  input: ProcessCheckoutCallbackInput
): Promise<ProcessCheckoutCallbackResult> {
  const { userId, sessionId } = input

  if (!sessionId) throw new CheckoutMissingSessionIdError()

  const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['payment_intent'],
  })

  if (checkoutSession.payment_status !== 'paid') {
    throw new CheckoutPaymentNotCompletedError()
  }

  if (checkoutSession.metadata?.userId !== userId) {
    throw new CheckoutSessionMismatchError()
  }

  const planTier = checkoutSession.metadata?.planTier as PlanTier
  if (!planTier || !PAID_PLANS.includes(planTier)) {
    throw new CheckoutInvalidPlanMetadataError()
  }

  // Idempotency check
  const paymentIntent = checkoutSession.payment_intent as import('stripe').Stripe.PaymentIntent | null
  if (paymentIntent?.id) {
    const existingPayment = await prisma.payment.findUnique({
      where: { stripePaymentIntentId: paymentIntent.id },
    })
    if (existingPayment) {
      return { success: true, alreadyProcessed: true }
    }
  }

  const planConfig = await getPlanConfig(planTier)
  const intervalDays = planConfig?.intervalDays ?? 30

  await activateSubscription(userId, planTier, intervalDays, 'stripe')

  // Save payment method and last payment time
  const updateData: Record<string, unknown> = { lastPaymentAt: new Date() }

  if (paymentIntent && typeof paymentIntent.payment_method === 'string') {
    updateData.stripePaymentMethodId = paymentIntent.payment_method

    const user = await prisma.user.findUnique({
      where: { id: userId },
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

  await prisma.user.update({ where: { id: userId }, data: updateData })

  // Record the payment and send invoice email
  const now = new Date()
  const periodEnd = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000)

  await recordPaymentAndNotify({
    userId,
    amount: checkoutSession.amount_total ?? 0,
    currency: checkoutSession.currency ?? 'usd',
    stripePaymentIntentId: paymentIntent?.id ?? null,
    stripeChargeId: extractChargeId(paymentIntent?.latest_charge),
    planTier,
    planName: planConfig?.name ?? planTier,
    type: 'initial',
    billingPeriodStart: now,
    billingPeriodEnd: periodEnd,
  })

  return { success: true }
}

// ── Recover unprocessed checkout ──────────────────────────────────────────────

export interface RecoverCheckoutResult {
  recovered: boolean
  reason?: string
  plan?: PlanTier
  message?: string
}

export async function recoverCheckout(userId: string): Promise<RecoverCheckoutResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      stripeCustomerId: true,
      plan: true,
      subscriptionStatus: true,
      name: true,
      email: true,
    },
  })

  if (!user?.stripeCustomerId) {
    return { recovered: false, reason: 'no_customer' }
  }

  if (user.plan !== 'FREE' && user.subscriptionStatus === 'ACTIVE') {
    return { recovered: false, reason: 'already_active' }
  }

  const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000)
  const sessions = await stripe.checkout.sessions.list({
    customer: user.stripeCustomerId,
    status: 'complete',
    created: { gte: oneDayAgo },
    limit: 5,
    expand: ['data.payment_intent'],
  })

  for (const checkoutSession of sessions.data) {
    if (checkoutSession.mode !== 'payment') continue
    if (checkoutSession.metadata?.userId !== userId) continue
    if (checkoutSession.payment_status !== 'paid') continue

    const planTier = checkoutSession.metadata?.planTier as PlanTier
    if (!planTier || !PAID_PLANS.includes(planTier)) continue

    const paymentIntent = checkoutSession.payment_intent as import('stripe').Stripe.PaymentIntent | null
    if (!paymentIntent?.id) continue

    const existingPayment = await prisma.payment.findUnique({
      where: { stripePaymentIntentId: paymentIntent.id },
    })
    if (existingPayment) continue

    console.log(`[recover-checkout] Recovering session ${checkoutSession.id} for user ${userId}, plan ${planTier}`)

    const planConfig = await getPlanConfig(planTier)
    const intervalDays = planConfig?.intervalDays ?? 30

    await activateSubscription(userId, planTier, intervalDays, 'stripe')

    if (typeof paymentIntent.payment_method === 'string') {
      try {
        await stripe.customers.update(user.stripeCustomerId, {
          invoice_settings: { default_payment_method: paymentIntent.payment_method },
        })
        await prisma.user.update({
          where: { id: userId },
          data: {
            stripePaymentMethodId: paymentIntent.payment_method,
            lastPaymentAt: new Date(),
          },
        })
      } catch (err) {
        console.error('[recover-checkout] Failed to set default payment method:', err)
      }
    }

    const now = new Date()
    const periodEnd = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000)

    await recordPaymentAndNotify({
      userId,
      amount: checkoutSession.amount_total ?? 0,
      currency: checkoutSession.currency ?? 'usd',
      stripePaymentIntentId: paymentIntent.id,
      stripeChargeId: extractChargeId(paymentIntent.latest_charge),
      planTier,
      planName: planConfig?.name ?? planTier,
      type: 'initial',
      billingPeriodStart: now,
      billingPeriodEnd: periodEnd,
      user: { name: user.name, email: user.email, stripeCustomerId: user.stripeCustomerId },
    })

    return {
      recovered: true,
      plan: planTier,
      message: `Your ${planTier} plan has been activated.`,
    }
  }

  return { recovered: false, reason: 'nothing_to_recover' }
}
