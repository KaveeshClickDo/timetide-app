/**
 * Subscription lifecycle: cancel, reactivate, schedule/cancel downgrade.
 *
 * Handles: status validation, atomic status transitions,
 * subscription history logging, and downgrade scheduling.
 */

import prisma from '@/server/db/prisma'
import {
  voluntaryUnsubscribe,
  scheduleUserDowngrade,
  cancelDowngrade,
} from '@/server/billing/subscription-lifecycle'
import { TIER_ORDER, type PlanTier } from '@/lib/pricing'

// ── Domain errors ─────────────────────────────────────────────────────────────

export class SubscriptionNoActiveError extends Error {
  constructor(message = 'No active subscription to cancel') {
    super(message)
    this.name = 'SubscriptionNoActiveError'
  }
}

export class SubscriptionFreePlanError extends Error {
  constructor(message = 'Free plan cannot be cancelled') {
    super(message)
    this.name = 'SubscriptionFreePlanError'
  }
}

export class SubscriptionUserNotFoundError extends Error {
  constructor() {
    super('User not found')
    this.name = 'SubscriptionUserNotFoundError'
  }
}

export class SubscriptionNotCancelledError extends Error {
  constructor() {
    super('Only cancelled subscriptions can be reactivated')
    this.name = 'SubscriptionNotCancelledError'
  }
}

export class SubscriptionNoSubscriptionError extends Error {
  constructor() {
    super('No subscription to reactivate')
    this.name = 'SubscriptionNoSubscriptionError'
  }
}

export class SubscriptionExpiredError extends Error {
  constructor() {
    super('Billing period has expired. Please subscribe again.')
    this.name = 'SubscriptionExpiredError'
  }
}

export class SubscriptionAlreadyChangedError extends Error {
  constructor() {
    super('Subscription status has already changed')
    this.name = 'SubscriptionAlreadyChangedError'
  }
}

export class SubscriptionInvalidPlanError extends Error {
  constructor() {
    super('Invalid plan')
    this.name = 'SubscriptionInvalidPlanError'
  }
}

export class SubscriptionNotDowngradeError extends Error {
  constructor() {
    super('This endpoint is for downgrades only')
    this.name = 'SubscriptionNotDowngradeError'
  }
}

// ── Cancel subscription ──────────────────────────────────────────────────────

export interface CancelSubscriptionResult {
  expiresAt: string | null
  message: string
}

export async function cancelSubscription(userId: string): Promise<CancelSubscriptionResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, subscriptionStatus: true, planExpiresAt: true },
  })

  if (!user || user.subscriptionStatus !== 'ACTIVE') {
    throw new SubscriptionNoActiveError()
  }

  if (user.plan === 'FREE') {
    throw new SubscriptionFreePlanError()
  }

  await voluntaryUnsubscribe(userId, 'user')

  return {
    expiresAt: user.planExpiresAt?.toISOString() ?? null,
    message: user.planExpiresAt
      ? `Subscription cancelled. Your ${user.plan} features remain active until ${user.planExpiresAt.toLocaleDateString()}.`
      : 'Subscription cancelled.',
  }
}

// ── Reactivate subscription ──────────────────────────────────────────────────

export interface ReactivateSubscriptionResult {
  message: string
}

export async function reactivateSubscription(userId: string): Promise<ReactivateSubscriptionResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, subscriptionStatus: true, planExpiresAt: true },
  })

  if (!user) throw new SubscriptionUserNotFoundError()

  if (user.subscriptionStatus !== 'UNSUBSCRIBED') {
    throw new SubscriptionNotCancelledError()
  }

  if (user.plan === 'FREE') {
    throw new SubscriptionNoSubscriptionError()
  }

  if (!user.planExpiresAt || user.planExpiresAt <= new Date()) {
    throw new SubscriptionExpiredError()
  }

  // Atomic: only update if still UNSUBSCRIBED (prevents race conditions)
  const result = await prisma.user.updateMany({
    where: { id: userId, subscriptionStatus: 'UNSUBSCRIBED' },
    data: {
      subscriptionStatus: 'ACTIVE',
      downgradeReason: null,
      downgradeInitiatedBy: null,
    },
  })

  if (result.count === 0) {
    throw new SubscriptionAlreadyChangedError()
  }

  await prisma.subscriptionHistory.create({
    data: {
      userId,
      action: 'reactivate',
      fromPlan: user.plan,
      toPlan: user.plan,
      fromStatus: 'UNSUBSCRIBED',
      toStatus: 'ACTIVE',
      reason: 'User reactivated cancelled subscription',
      initiatedBy: 'user',
    },
  })

  return {
    message: `Your ${user.plan} subscription has been reactivated! It will renew on ${user.planExpiresAt.toLocaleDateString()}.`,
  }
}

// ── Schedule downgrade ───────────────────────────────────────────────────────

export interface ScheduleDowngradeInput {
  userId: string
  plan: string
}

export interface ScheduleDowngradeResult {
  switchDate: string
  message: string
}

export async function scheduleDowngrade(input: ScheduleDowngradeInput): Promise<ScheduleDowngradeResult> {
  const { userId, plan } = input

  if (!plan || !['FREE', 'PRO', 'TEAM'].includes(plan)) {
    throw new SubscriptionInvalidPlanError()
  }

  const targetPlan = plan as PlanTier

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, subscriptionStatus: true },
  })
  const currentPlan = (dbUser?.plan as PlanTier) || 'FREE'

  if (TIER_ORDER.indexOf(targetPlan) >= TIER_ORDER.indexOf(currentPlan)) {
    throw new SubscriptionNotDowngradeError()
  }

  // If user is still ACTIVE, unsubscribe first (ACTIVE → UNSUBSCRIBED)
  if (dbUser?.subscriptionStatus === 'ACTIVE') {
    await voluntaryUnsubscribe(userId, 'user')
  }

  const { switchDate } = await scheduleUserDowngrade(userId, targetPlan)

  return {
    switchDate: switchDate.toISOString(),
    message: `Your plan will switch to ${targetPlan} on ${switchDate.toLocaleDateString()}`,
  }
}

// ── Cancel scheduled downgrade ───────────────────────────────────────────────

export async function cancelScheduledDowngrade(userId: string): Promise<void> {
  await cancelDowngrade(userId, 'user')
}
