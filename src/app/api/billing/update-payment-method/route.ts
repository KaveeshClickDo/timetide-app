import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/admin-auth'
import { stripe, getOrCreateStripeCustomer } from '@/lib/stripe'

/** POST - Create a Stripe Checkout session in `setup` mode to update payment method */
export async function POST() {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const customerId = await getOrCreateStripeCustomer(
      session.user.id,
      session.user.email,
      session.user.name || null,
    )

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: customerId,
      payment_method_types: ['card'],
      success_url: `${process.env.NEXTAUTH_URL}/dashboard/billing?card_updated=true&setup_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXTAUTH_URL}/dashboard/billing`,
      metadata: {
        userId: session.user.id,
        type: 'update_payment_method',
      },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err) {
    console.error('Update payment method error:', err)
    return NextResponse.json({ error: 'Failed to create setup session' }, { status: 500 })
  }
}
