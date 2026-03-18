import Stripe from 'stripe'
import prisma from '@/lib/prisma'
import type { PlanTier } from '@/lib/pricing'

// ---------------------------------------------------------------------------
// Stripe client singleton (lazy — avoids crashing at build time without env vars)
// ---------------------------------------------------------------------------

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured')
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      typescript: true,
    })
  }
  return _stripe
}

/** Convenience alias — lazily delegates to getStripe() */
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

// ---------------------------------------------------------------------------
// Price ID map — maps our plan tiers to Stripe Price IDs
// ---------------------------------------------------------------------------

export const STRIPE_PRICE_MAP: Partial<Record<PlanTier, string>> = {
  PRO: process.env.STRIPE_PRICE_PRO_MONTHLY || undefined,
  TEAM: process.env.STRIPE_PRICE_TEAM_MONTHLY || undefined,
}

/** Reverse lookup: Stripe Price ID → PlanTier */
export function planFromPriceId(priceId: string): PlanTier | null {
  for (const [plan, id] of Object.entries(STRIPE_PRICE_MAP)) {
    if (id === priceId) return plan as PlanTier
  }
  return null
}

// ---------------------------------------------------------------------------
// Customer management
// ---------------------------------------------------------------------------

/**
 * Get or create a Stripe customer for a user.
 * Stores stripeCustomerId on the User record for future lookups.
 */
export async function getOrCreateStripeCustomer(
  userId: string,
  email: string,
  name: string | null,
): Promise<string> {
  // Check if user already has a Stripe customer
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  })

  if (user?.stripeCustomerId) {
    return user.stripeCustomerId
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email,
    name: name || undefined,
    metadata: { userId },
  })

  // Store on user record
  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  })

  return customer.id
}

// ---------------------------------------------------------------------------
// Subscription helpers
// ---------------------------------------------------------------------------

/**
 * Get the first subscription item ID for a subscription.
 * Needed when updating the subscription's price.
 */
export async function getSubscriptionItemId(
  subscriptionId: string,
): Promise<string | null> {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    return subscription.items.data[0]?.id ?? null
  } catch {
    return null
  }
}

/**
 * Calculate days until a Unix timestamp from now.
 */
export function daysUntilTimestamp(unixTimestamp: number): number {
  const now = Date.now() / 1000
  return Math.max(1, Math.ceil((unixTimestamp - now) / 86400))
}

/**
 * Convert Stripe Unix timestamp to Date.
 */
export function timestampToDate(unixTimestamp: number): Date {
  return new Date(unixTimestamp * 1000)
}
