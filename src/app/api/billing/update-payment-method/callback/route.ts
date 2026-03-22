import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/admin-auth'
import { stripe } from '@/lib/stripe'
import prisma from '@/lib/prisma'

/** POST - Handle Stripe setup session completion — set new card as default */
export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const { sessionId } = await req.json()
    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
    }

    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId)

    // Verify ownership
    if (checkoutSession.metadata?.userId !== session.user.id) {
      return NextResponse.json({ error: 'Session mismatch' }, { status: 403 })
    }

    if (checkoutSession.metadata?.type !== 'update_payment_method') {
      return NextResponse.json({ error: 'Invalid session type' }, { status: 400 })
    }

    // Get the setup intent to find the new payment method
    const setupIntentId = checkoutSession.setup_intent as string
    if (!setupIntentId) {
      return NextResponse.json({ error: 'No setup intent found' }, { status: 400 })
    }

    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId)
    const paymentMethodId = typeof setupIntent.payment_method === 'string'
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id

    if (!paymentMethodId) {
      return NextResponse.json({ error: 'No payment method found' }, { status: 400 })
    }

    // Set as customer's default payment method
    const customerId = checkoutSession.customer as string
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    })

    // Update our DB record
    await prisma.user.update({
      where: { id: session.user.id },
      data: { stripePaymentMethodId: paymentMethodId },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Update payment method callback error:', err)
    return NextResponse.json({ error: 'Failed to update payment method' }, { status: 500 })
  }
}
