import Stripe from 'stripe'
import prisma from '@/server/db/prisma'

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
 * Extract the charge ID from a PaymentIntent's latest_charge field.
 * Stripe returns either a string ID or a full Charge object depending on expansion.
 */
export function extractChargeId(
  latestCharge: string | Stripe.Charge | null | undefined,
): string | null {
  if (!latestCharge) return null
  return typeof latestCharge === 'string' ? latestCharge : latestCharge.id
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

// ---------------------------------------------------------------------------
// Invoice helpers
// ---------------------------------------------------------------------------

/**
 * Generate a TimeTide invoice number from a payment record.
 * Format: TT-YYYYMM-XXXXXX (last 6 chars of payment ID)
 */
export function generateInvoiceNumber(paymentId: string, date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `TT-${yyyy}${mm}-${paymentId.slice(-6).toUpperCase()}`
}

// ---------------------------------------------------------------------------
// Record payment + send invoice email
// ---------------------------------------------------------------------------

export interface RecordPaymentParams {
  userId: string
  amount: number
  currency: string
  stripePaymentIntentId: string | null
  stripeChargeId: string | null
  planTier: string
  planName: string
  type: 'initial' | 'renewal' | 'upgrade_proration'
  billingPeriodStart: Date
  billingPeriodEnd: Date
  metadata?: Record<string, string | number | boolean | null>
  /** User info for the invoice email. If omitted, fetched from DB. */
  user?: { name: string | null; email: string | null; stripeCustomerId: string | null }
}

/**
 * Record a payment in the database and queue an invoice email.
 * Shared by checkout/callback, recover-checkout, and upgrade routes.
 */
export async function recordPaymentAndNotify(params: RecordPaymentParams): Promise<void> {
  const { queuePaymentSuccessEmail } = await import('@/server/infrastructure/queue/email-queue')

  const payment = await prisma.payment.create({
    data: {
      userId: params.userId,
      amount: params.amount,
      currency: params.currency,
      status: 'succeeded',
      stripePaymentIntentId: params.stripePaymentIntentId,
      stripeChargeId: params.stripeChargeId,
      planTier: params.planTier,
      type: params.type,
      billingPeriodStart: params.billingPeriodStart,
      billingPeriodEnd: params.billingPeriodEnd,
      ...(params.metadata ? { metadata: params.metadata } : {}),
    },
  })

  // Resolve user info
  const user = params.user ?? await prisma.user.findUnique({
    where: { id: params.userId },
    select: { name: true, email: true, stripeCustomerId: true },
  })

  if (!user?.email) return

  const cardInfo = user.stripeCustomerId
    ? await getCustomerPaymentMethod(user.stripeCustomerId).catch(() => null)
    : null

  const now = params.billingPeriodStart
  const invoiceNum = generateInvoiceNumber(payment.id, now)

  queuePaymentSuccessEmail({
    userName: user.name || 'there',
    userEmail: user.email,
    planName: params.planName,
    planTier: params.planTier,
    amount: payment.amount,
    currency: payment.currency,
    invoiceNumber: invoiceNum,
    paymentDate: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    billingPeriodStart: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    billingPeriodEnd: params.billingPeriodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    cardLast4: cardInfo?.last4,
    cardBrand: cardInfo?.brand,
    paymentType: params.type,
    updatePaymentUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
    billingUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
  }).catch(console.error)
}
