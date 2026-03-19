import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe, planFromPriceId, timestampToDate } from '@/lib/stripe'
import prisma from '@/lib/prisma'
import {
  activateSubscription,
  voluntaryUnsubscribe,
  startGracePeriod,
} from '@/lib/subscription-lifecycle'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getUserByStripeCustomerId(customerId: string) {
  return prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true, plan: true, subscriptionStatus: true },
  })
}

/** Extract customer ID string from various Stripe object shapes */
function extractCustomerId(obj: { customer?: string | Stripe.Customer | Stripe.DeletedCustomer | null }): string | null {
  if (!obj.customer) return null
  if (typeof obj.customer === 'string') return obj.customer
  return obj.customer.id
}

/** Get the first item's current_period_end from a subscription (Stripe v20+: period is per item) */
function getSubscriptionPeriodEnd(subscription: Stripe.Subscription): number | null {
  const firstItem = subscription.items.data[0]
  if (!firstItem) return null
  return firstItem.current_period_end ?? null
}

/** Get the first item's price ID from a subscription */
function getPriceId(subscription: Stripe.Subscription): string | null {
  return subscription.items.data[0]?.price?.id ?? null
}

/** Get subscription ID from an invoice (Stripe v20+: parent.subscription_details) */
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription
  if (!sub) return null
  return typeof sub === 'string' ? sub : sub.id
}

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[stripe-webhook] Signature verification failed:', message)
    return NextResponse.json({ error: `Webhook signature verification failed` }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event)
        break

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event)
        break

      case 'invoice.payment_failed':
        await handlePaymentFailed(event)
        break

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`)
    }
  } catch (error) {
    // Log but return 200 — Stripe retries on non-2xx and we don't want infinite retries
    console.error(`[stripe-webhook] Error handling ${event.type}:`, error)
  }

  return NextResponse.json({ received: true })
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/**
 * New subscription created (user completed checkout).
 */
async function handleSubscriptionCreated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription
  const customerId = extractCustomerId(subscription)
  if (!customerId) return

  const user = await getUserByStripeCustomerId(customerId)
  if (!user) {
    console.error('[stripe-webhook] No user found for customer:', customerId)
    return
  }

  const priceId = getPriceId(subscription)
  if (!priceId) return

  const plan = planFromPriceId(priceId)
  if (!plan) {
    console.error('[stripe-webhook] Unknown price ID:', priceId)
    return
  }

  // Store subscription ID on user
  await prisma.user.update({
    where: { id: user.id },
    data: { stripeSubscriptionId: subscription.id },
  })

  // Activate with Stripe's exact period end
  const periodEnd = getSubscriptionPeriodEnd(subscription)
  const expiresAt = periodEnd ? timestampToDate(periodEnd) : undefined
  await activateSubscription(user.id, plan, expiresAt ?? 30, 'system')

  console.log(`[stripe-webhook] Subscription created: user=${user.id} plan=${plan}`)
}

/**
 * Subscription updated — plan change, cancellation scheduled, or un-cancelled.
 */
async function handleSubscriptionUpdated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription
  const customerId = extractCustomerId(subscription)
  if (!customerId) return

  const user = await getUserByStripeCustomerId(customerId)
  if (!user) return

  const previousAttributes = (event.data as unknown as { previous_attributes?: Record<string, unknown> }).previous_attributes || {}

  // Check if user scheduled a cancellation via portal
  if (subscription.cancel_at_period_end && 'cancel_at_period_end' in previousAttributes) {
    if (user.subscriptionStatus === 'ACTIVE') {
      // User cancelled — keep access until period end
      await voluntaryUnsubscribe(user.id, 'user')
      console.log(`[stripe-webhook] User cancelled (period end): user=${user.id}`)
    } else if (user.subscriptionStatus === 'DOWNGRADING') {
      // Already scheduled for downgrade — Stripe cancellation is expected, no DB change needed
      console.log(`[stripe-webhook] Cancel confirmed for DOWNGRADING user: user=${user.id}`)
    }
    return
  }

  // Check if user un-cancelled (reversed a pending cancellation)
  if (!subscription.cancel_at_period_end && 'cancel_at_period_end' in previousAttributes) {
    if (['UNSUBSCRIBED', 'DOWNGRADING'].includes(user.subscriptionStatus)) {
      const periodEnd = getSubscriptionPeriodEnd(subscription)
      const expiresAt = periodEnd ? timestampToDate(periodEnd) : undefined
      const priceId = getPriceId(subscription)
      const plan = priceId ? planFromPriceId(priceId) : null
      if (plan) {
        await activateSubscription(user.id, plan, expiresAt ?? 30, 'system')
        console.log(`[stripe-webhook] User un-cancelled: user=${user.id} (was ${user.subscriptionStatus})`)
      }
    }
    return
  }

  // Check if plan/price changed (upgrade or downgrade via portal)
  if ('items' in previousAttributes) {
    const priceId = getPriceId(subscription)
    if (!priceId) return

    const newPlan = planFromPriceId(priceId)
    if (!newPlan || newPlan === user.plan) return

    const periodEnd = getSubscriptionPeriodEnd(subscription)
    const expiresAt = periodEnd ? timestampToDate(periodEnd) : undefined
    // Stripe handles prorations, so we just activate the new plan
    await activateSubscription(user.id, newPlan, expiresAt ?? 30, 'system')
    console.log(`[stripe-webhook] Plan changed: user=${user.id} → ${newPlan}`)
  }
}

/**
 * Subscription fully deleted (period ended after cancel, or immediate cancel).
 */
async function handleSubscriptionDeleted(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription
  const customerId = extractCustomerId(subscription)
  if (!customerId) return

  const user = await getUserByStripeCustomerId(customerId)
  if (!user) return

  // Clear the subscription ID
  await prisma.user.update({
    where: { id: user.id },
    data: { stripeSubscriptionId: null },
  })

  // Start grace period if not already in one
  if (['ACTIVE', 'UNSUBSCRIBED'].includes(user.subscriptionStatus)) {
    await startGracePeriod(user.id)
    console.log(`[stripe-webhook] Subscription deleted, grace started: user=${user.id}`)
  } else if (user.subscriptionStatus === 'DOWNGRADING') {
    // DOWNGRADING users: background job handles the transition at gracePeriodEndsAt
    console.log(`[stripe-webhook] Subscription deleted for DOWNGRADING user: user=${user.id} (background job will handle transition)`)
  }
}

/**
 * Invoice payment succeeded — handles renewals.
 */
async function handlePaymentSucceeded(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice
  const customerId = extractCustomerId(invoice)
  if (!customerId) return

  // Only handle subscription invoices
  const subscriptionId = getInvoiceSubscriptionId(invoice)
  if (!subscriptionId) return

  // Skip the first invoice (handled by subscription.created)
  if (invoice.billing_reason === 'subscription_create') return

  const user = await getUserByStripeCustomerId(customerId)
  if (!user) return

  // Fetch the subscription to get current_period_end and price
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const priceId = getPriceId(subscription)
  if (!priceId) return

  const plan = planFromPriceId(priceId)
  if (!plan) return

  const periodEnd = getSubscriptionPeriodEnd(subscription)
  const expiresAt = periodEnd ? timestampToDate(periodEnd) : undefined
  await activateSubscription(user.id, plan, expiresAt ?? 30, 'system')

  console.log(`[stripe-webhook] Renewal payment succeeded: user=${user.id} plan=${plan}`)
}

/**
 * Invoice payment failed — act only on final failure (no more retries).
 */
async function handlePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice
  const customerId = extractCustomerId(invoice)
  if (!customerId) return

  // Only act when Stripe has exhausted all retries
  if (invoice.next_payment_attempt !== null) {
    console.log(`[stripe-webhook] Payment failed but will retry: customer=${customerId}`)
    return
  }

  const user = await getUserByStripeCustomerId(customerId)
  if (!user) return

  // Start grace period — user gets 7 more days before lock
  if (['ACTIVE', 'UNSUBSCRIBED'].includes(user.subscriptionStatus)) {
    await startGracePeriod(user.id)
    console.log(`[stripe-webhook] Final payment failure, grace started: user=${user.id}`)
  }
}
