/**
 * Payment method management: create setup session, process callback.
 *
 * Handles: Stripe setup mode checkout, session verification,
 * default payment method update on Stripe and in DB.
 */

import prisma from '@/server/db/prisma'
import { stripe, getOrCreateStripeCustomer } from '@/server/billing/stripe'

// ── Domain errors ─────────────────────────────────────────────────────────────

export class PaymentMethodMissingSessionIdError extends Error {
  constructor() {
    super('Missing sessionId')
    this.name = 'PaymentMethodMissingSessionIdError'
  }
}

export class PaymentMethodSessionMismatchError extends Error {
  constructor() {
    super('Session mismatch')
    this.name = 'PaymentMethodSessionMismatchError'
  }
}

export class PaymentMethodInvalidSessionTypeError extends Error {
  constructor() {
    super('Invalid session type')
    this.name = 'PaymentMethodInvalidSessionTypeError'
  }
}

export class PaymentMethodNoSetupIntentError extends Error {
  constructor() {
    super('No setup intent found')
    this.name = 'PaymentMethodNoSetupIntentError'
  }
}

export class PaymentMethodNotFoundError extends Error {
  constructor() {
    super('No payment method found')
    this.name = 'PaymentMethodNotFoundError'
  }
}

// ── Create payment method setup session ──────────────────────────────────────

export interface CreatePaymentMethodSessionInput {
  userId: string
  userEmail: string
  userName: string | null
}

export interface CreatePaymentMethodSessionResult {
  url: string | null
}

export async function createPaymentMethodSession(
  input: CreatePaymentMethodSessionInput
): Promise<CreatePaymentMethodSessionResult> {
  const { userId, userEmail, userName } = input

  const customerId = await getOrCreateStripeCustomer(userId, userEmail, userName)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'setup',
    customer: customerId,
    payment_method_types: ['card'],
    success_url: `${appUrl}/dashboard/billing?card_updated=true&setup_session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/dashboard/billing`,
    metadata: { userId, type: 'update_payment_method' },
  })

  return { url: checkoutSession.url }
}

// ── Process payment method callback ──────────────────────────────────────────

export interface ProcessPaymentMethodCallbackInput {
  userId: string
  sessionId: string
}

export async function processPaymentMethodCallback(
  input: ProcessPaymentMethodCallbackInput
): Promise<void> {
  const { userId, sessionId } = input

  if (!sessionId) throw new PaymentMethodMissingSessionIdError()

  const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId)

  if (checkoutSession.metadata?.userId !== userId) {
    throw new PaymentMethodSessionMismatchError()
  }

  if (checkoutSession.metadata?.type !== 'update_payment_method') {
    throw new PaymentMethodInvalidSessionTypeError()
  }

  const setupIntentId = checkoutSession.setup_intent as string
  if (!setupIntentId) throw new PaymentMethodNoSetupIntentError()

  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId)
  const paymentMethodId =
    typeof setupIntent.payment_method === 'string'
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id

  if (!paymentMethodId) throw new PaymentMethodNotFoundError()

  const customerId = checkoutSession.customer as string
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  })

  await prisma.user.update({
    where: { id: userId },
    data: { stripePaymentMethodId: paymentMethodId },
  })
}
