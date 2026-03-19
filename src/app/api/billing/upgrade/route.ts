import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { chargeCustomer, getCustomerPaymentMethod } from '@/lib/stripe'
import { queuePaymentSuccessEmail } from '@/lib/infrastructure/queue/email-queue'
import { type PlanTier } from '@/lib/pricing'
import { getPlanConfig } from '@/lib/pricing-server'
import prisma from '@/lib/prisma'

const TIER_ORDER: PlanTier[] = ['FREE', 'PRO', 'TEAM']

/**
 * POST /api/billing/upgrade
 *
 * Upgrade from a lower paid plan to a higher paid plan mid-cycle.
 * Charges the prorated difference for the remaining days.
 * Plan updates immediately; billing cycle (planExpiresAt) stays the same.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { plan } = (await req.json()) as { plan?: string }

    if (!plan || !['PRO', 'TEAM'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const targetPlan = plan as PlanTier

    // Read current state from DB
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        plan: true,
        subscriptionStatus: true,
        planExpiresAt: true,
        stripeCustomerId: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const currentPlan = user.plan as PlanTier

    // Validate: must be ACTIVE on a paid plan
    if (user.subscriptionStatus !== 'ACTIVE' || currentPlan === 'FREE') {
      return NextResponse.json(
        { error: 'Must have an active paid subscription to upgrade' },
        { status: 400 },
      )
    }

    // Validate: target must be a higher tier
    if (TIER_ORDER.indexOf(targetPlan) <= TIER_ORDER.indexOf(currentPlan)) {
      return NextResponse.json(
        { error: 'Target plan must be higher than current plan' },
        { status: 400 },
      )
    }

    if (!user.stripeCustomerId) {
      return NextResponse.json(
        { error: 'No payment method on file. Please subscribe first.' },
        { status: 400 },
      )
    }

    // Fetch plan configs
    const [currentConfig, targetConfig] = await Promise.all([
      getPlanConfig(currentPlan),
      getPlanConfig(targetPlan),
    ])

    if (!currentConfig || !targetConfig) {
      return NextResponse.json({ error: 'Plan configuration not found' }, { status: 500 })
    }

    // Calculate proration
    const now = new Date()
    const expiresAt = user.planExpiresAt ? new Date(user.planExpiresAt) : now
    const remainingMs = Math.max(0, expiresAt.getTime() - now.getTime())
    const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000))
    const cycleDays = currentConfig.intervalDays || 30

    const dailyDiff = (targetConfig.price - currentConfig.price) / cycleDays
    const prorationAmount = Math.max(0, Math.round(remainingDays * dailyDiff))

    // Charge the proration amount if > 0
    let paymentIntentId: string | null = null
    let chargeId: string | null = null

    if (prorationAmount > 0) {
      try {
        const pi = await chargeCustomer(
          user.stripeCustomerId,
          prorationAmount,
          targetConfig.currency,
          {
            userId: session.user.id,
            planTier: targetPlan,
            type: 'upgrade_proration',
            fromPlan: currentPlan,
          },
        )
        paymentIntentId = pi.id
        chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id ?? null
      } catch (err) {
        console.error('[upgrade] Proration charge failed:', err)
        return NextResponse.json(
          { error: 'Payment failed. Please update your payment method and try again.' },
          { status: 402 },
        )
      }
    }

    // Activate the new plan — keep the same planExpiresAt (billing cycle stays)
    // We pass 0 as expiresInDays to signal "keep existing expiry"
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        plan: targetPlan,
        planActivatedAt: now,
        lastPaymentAt: prorationAmount > 0 ? now : undefined,
      },
    })

    // Log the subscription history
    await prisma.subscriptionHistory.create({
      data: {
        userId: session.user.id,
        action: 'upgrade',
        fromPlan: currentPlan,
        toPlan: targetPlan,
        fromStatus: 'ACTIVE',
        toStatus: 'ACTIVE',
        reason: `Upgrade from ${currentPlan} to ${targetPlan}`,
        initiatedBy: 'user',
        metadata: {
          prorationAmount,
          remainingDays,
          paymentIntentId,
        },
      },
    })

    // Record the proration payment and send invoice
    if (prorationAmount > 0) {
      const payment = await prisma.payment.create({
        data: {
          userId: session.user.id,
          amount: prorationAmount,
          currency: targetConfig.currency,
          status: 'succeeded',
          stripePaymentIntentId: paymentIntentId,
          stripeChargeId: chargeId,
          planTier: targetPlan,
          type: 'upgrade_proration',
          billingPeriodStart: now,
          billingPeriodEnd: expiresAt,
          metadata: {
            fromPlan: currentPlan,
            remainingDays,
          },
        },
      })

      // Send upgrade invoice email
      const cardInfo = user.stripeCustomerId
        ? await getCustomerPaymentMethod(user.stripeCustomerId).catch(() => null)
        : null
      const invoiceNum = `TT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${payment.id.slice(-6).toUpperCase()}`
      queuePaymentSuccessEmail({
        userName: session.user.name || 'there',
        userEmail: session.user.email,
        planName: targetConfig.name,
        planTier: targetPlan,
        amount: prorationAmount,
        currency: targetConfig.currency,
        invoiceNumber: invoiceNum,
        paymentDate: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        billingPeriodStart: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        billingPeriodEnd: expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        cardLast4: cardInfo?.last4,
        cardBrand: cardInfo?.brand,
        paymentType: 'upgrade_proration',
        updatePaymentUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
        billingUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
      }).catch(console.error)
    }

    return NextResponse.json({
      success: true,
      plan: targetPlan,
      prorationAmount,
      prorationFormatted: prorationAmount > 0 ? `$${(prorationAmount / 100).toFixed(2)}` : '$0.00',
      message: prorationAmount > 0
        ? `Upgraded to ${targetConfig.name}! You were charged $${(prorationAmount / 100).toFixed(2)} for the remaining ${remainingDays} days.`
        : `Upgraded to ${targetConfig.name}!`,
    })
  } catch (error) {
    console.error('Upgrade error:', error)
    return NextResponse.json({ error: 'Failed to upgrade plan' }, { status: 500 })
  }
}
