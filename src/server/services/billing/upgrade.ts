/**
 * Plan upgrade: mid-cycle upgrade from lower to higher paid plan.
 *
 * Handles: proration calculation, Stripe charge, plan activation,
 * subscription history, notification, email, and payment recording.
 */

import prisma from '@/server/db/prisma'
import { chargeCustomer, extractChargeId, recordPaymentAndNotify } from '@/server/billing/stripe'
import { TIER_ORDER, PAID_PLANS, type PlanTier } from '@/lib/pricing'
import { getPlanConfig } from '@/server/billing/pricing-server'
import { createNotification } from '@/server/notifications'

// ── Domain errors ─────────────────────────────────────────────────────────────

export class UpgradeInvalidPlanError extends Error {
  constructor() {
    super('Invalid plan')
    this.name = 'UpgradeInvalidPlanError'
  }
}

export class UpgradeUserNotFoundError extends Error {
  constructor() {
    super('User not found')
    this.name = 'UpgradeUserNotFoundError'
  }
}

export class UpgradeNotActiveError extends Error {
  constructor() {
    super('Must have an active paid subscription to upgrade')
    this.name = 'UpgradeNotActiveError'
  }
}

export class UpgradeNotHigherTierError extends Error {
  constructor() {
    super('Target plan must be higher than current plan')
    this.name = 'UpgradeNotHigherTierError'
  }
}

export class UpgradeNoPaymentMethodError extends Error {
  constructor() {
    super('No payment method on file. Please subscribe first.')
    this.name = 'UpgradeNoPaymentMethodError'
  }
}

export class UpgradePlanConfigError extends Error {
  constructor() {
    super('Plan configuration not found')
    this.name = 'UpgradePlanConfigError'
  }
}

export class UpgradePaymentFailedError extends Error {
  constructor() {
    super('Payment failed. Please update your payment method and try again.')
    this.name = 'UpgradePaymentFailedError'
  }
}

// ── Upgrade plan ──────────────────────────────────────────────────────────────

export interface UpgradePlanInput {
  userId: string
  userName?: string | null
  userEmail: string
  plan: string
}

export interface UpgradePlanResult {
  plan: PlanTier
  prorationAmount: number
  prorationFormatted: string
  message: string
}

export async function upgradePlan(input: UpgradePlanInput): Promise<UpgradePlanResult> {
  const { userId, userName, userEmail, plan } = input

  if (!plan || !PAID_PLANS.includes(plan as PlanTier)) {
    throw new UpgradeInvalidPlanError()
  }

  const targetPlan = plan as PlanTier

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      subscriptionStatus: true,
      planExpiresAt: true,
      stripeCustomerId: true,
    },
  })

  if (!user) throw new UpgradeUserNotFoundError()

  const currentPlan = user.plan as PlanTier

  if (user.subscriptionStatus !== 'ACTIVE' || currentPlan === 'FREE') {
    throw new UpgradeNotActiveError()
  }

  if (TIER_ORDER.indexOf(targetPlan) <= TIER_ORDER.indexOf(currentPlan)) {
    throw new UpgradeNotHigherTierError()
  }

  if (!user.stripeCustomerId) throw new UpgradeNoPaymentMethodError()

  const [currentConfig, targetConfig] = await Promise.all([
    getPlanConfig(currentPlan),
    getPlanConfig(targetPlan),
  ])

  if (!currentConfig || !targetConfig) throw new UpgradePlanConfigError()

  // Calculate proration
  const now = new Date()
  const expiresAt = user.planExpiresAt ? new Date(user.planExpiresAt) : now
  const remainingMs = Math.max(0, expiresAt.getTime() - now.getTime())
  const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000))
  const cycleDays = currentConfig.intervalDays || 30

  const dailyDiff = (targetConfig.price - currentConfig.price) / cycleDays
  const prorationAmount = Math.max(0, Math.round(remainingDays * dailyDiff))

  // Charge the proration
  let paymentIntentId: string | null = null
  let chargeId: string | null = null

  if (prorationAmount > 0) {
    try {
      const pi = await chargeCustomer(
        user.stripeCustomerId,
        prorationAmount,
        targetConfig.currency,
        {
          userId,
          planTier: targetPlan,
          type: 'upgrade_proration',
          fromPlan: currentPlan,
        },
      )
      paymentIntentId = pi.id
      chargeId = extractChargeId(pi.latest_charge)
    } catch (err) {
      console.error('[upgrade] Proration charge failed:', err)
      throw new UpgradePaymentFailedError()
    }
  }

  // Activate the new plan — keep the same planExpiresAt
  await prisma.user.update({
    where: { id: userId },
    data: {
      plan: targetPlan,
      planActivatedAt: now,
      lastPaymentAt: prorationAmount > 0 ? now : undefined,
    },
  })

  // Log subscription history
  await prisma.subscriptionHistory.create({
    data: {
      userId,
      action: 'upgrade',
      fromPlan: currentPlan,
      toPlan: targetPlan,
      fromStatus: 'ACTIVE',
      toStatus: 'ACTIVE',
      reason: `Upgrade from ${currentPlan} to ${targetPlan}`,
      initiatedBy: 'user',
      metadata: { prorationAmount, remainingDays, paymentIntentId },
    },
  })

  // Send upgrade notification
  await createNotification({
    userId,
    type: 'PLAN_REACTIVATED',
    title: `Upgraded to ${targetConfig.name}`,
    message: prorationAmount > 0
      ? `Your plan has been upgraded to ${targetConfig.name}. You were charged $${(prorationAmount / 100).toFixed(2)} for the remaining days.`
      : `Your plan has been upgraded to ${targetConfig.name}.`,
  })

  // Send upgrade email (fire-and-forget)
  try {
    const { queueEmail } = await import('@/server/infrastructure/queue/email-queue')
    await queueEmail({
      type: 'plan_activated',
      to: userEmail,
      subject: `Your plan has been upgraded to ${targetConfig.name}`,
      planData: {
        userName: userName || 'there',
        userEmail,
        currentPlan: targetPlan,
        expiresAt: expiresAt.toLocaleDateString(),
        reactivateUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      },
    })
  } catch (err) {
    console.error('[upgrade] Could not queue upgrade email:', err)
  }

  // Record payment and send invoice
  if (prorationAmount > 0) {
    await recordPaymentAndNotify({
      userId,
      amount: prorationAmount,
      currency: targetConfig.currency,
      stripePaymentIntentId: paymentIntentId,
      stripeChargeId: chargeId,
      planTier: targetPlan,
      planName: targetConfig.name,
      type: 'upgrade_proration',
      billingPeriodStart: now,
      billingPeriodEnd: expiresAt,
      metadata: { fromPlan: currentPlan, remainingDays },
      user: { name: userName ?? null, email: userEmail, stripeCustomerId: user.stripeCustomerId },
    })
  }

  return {
    plan: targetPlan,
    prorationAmount,
    prorationFormatted: prorationAmount > 0 ? `$${(prorationAmount / 100).toFixed(2)}` : '$0.00',
    message: prorationAmount > 0
      ? `Upgraded to ${targetConfig.name}! You were charged $${(prorationAmount / 100).toFixed(2)} for the remaining ${remainingDays} days.`
      : `Upgraded to ${targetConfig.name}!`,
  }
}
