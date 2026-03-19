import Stripe from 'stripe'
import prisma from '@/lib/prisma'

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
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  })

  if (user?.stripeCustomerId) {
    return user.stripeCustomerId
  }

  const customer = await stripe.customers.create({
    email,
    name: name || undefined,
    metadata: { userId },
  })

  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  })

  return customer.id
}

// ---------------------------------------------------------------------------
// Payment helpers
// ---------------------------------------------------------------------------

/**
 * Charge a customer using their saved payment method.
 * Used for recurring renewals and upgrade prorations.
 */
export async function chargeCustomer(
  customerId: string,
  amount: number,
  currency: string,
  metadata: Record<string, string>,
): Promise<Stripe.PaymentIntent> {
  // Get the customer's default payment method
  const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer
  const paymentMethodId =
    (typeof customer.invoice_settings?.default_payment_method === 'string'
      ? customer.invoice_settings.default_payment_method
      : customer.invoice_settings?.default_payment_method?.id) ?? null

  if (!paymentMethodId) {
    throw new Error('No payment method on file for this customer')
  }

  return stripe.paymentIntents.create({
    amount,
    currency,
    customer: customerId,
    payment_method: paymentMethodId,
    off_session: true,
    confirm: true,
    metadata,
  })
}

/**
 * Issue a refund for a payment intent.
 * If amount is omitted, issues a full refund.
 */
export async function refundPayment(
  paymentIntentId: string,
  amount?: number,
): Promise<Stripe.Refund> {
  return stripe.refunds.create({
    payment_intent: paymentIntentId,
    ...(amount ? { amount } : {}),
  })
}

/**
 * Get the last 4 digits and brand of a customer's default payment method.
 */
export async function getCustomerPaymentMethod(
  customerId: string,
): Promise<{ last4: string; brand: string; id: string } | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer
    const pmId =
      typeof customer.invoice_settings?.default_payment_method === 'string'
        ? customer.invoice_settings.default_payment_method
        : customer.invoice_settings?.default_payment_method?.id

    if (!pmId) return null

    const pm = await stripe.paymentMethods.retrieve(pmId)
    return {
      id: pm.id,
      last4: pm.card?.last4 ?? '****',
      brand: pm.card?.brand ?? 'unknown',
    }
  } catch {
    return null
  }
}
