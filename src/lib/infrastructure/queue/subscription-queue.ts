/**
 * Subscription Lifecycle Queue
 *
 * BullMQ-based queue for handling subscription expirations,
 * grace periods, and warning emails.
 *
 * Repeatable jobs:
 *   - check_expirations:  every 15 min — transitions ACTIVE/UNSUBSCRIBED → GRACE_PERIOD
 *   - check_grace_periods: every 15 min — transitions GRACE_PERIOD/DOWNGRADING → LOCKED
 *
 * One-off jobs:
 *   - send_warning: scheduled at specific times to send warning emails
 */

import { Queue, Worker, Job } from 'bullmq'
import { redis, isRedisAvailable } from './redis'
import prisma from '../../prisma'
import {
  startGracePeriod,
  lockResources,
  activateSubscription,
} from '@/lib/subscription-lifecycle'
import { chargeCustomer, getCustomerPaymentMethod, stripe } from '@/lib/stripe'
import { getPlanConfig } from '@/lib/pricing-server'
import { createNotification } from '@/lib/notifications'
import { queueEmail, queuePaymentSuccessEmail, queuePaymentFailedEmail } from './email-queue'
import type { PlanTier } from '@/lib/pricing'
import type { SubscriptionJobData, PlanEmailData } from '@/types/queue'

// ============================================================================
// Queue Setup
// ============================================================================

let subscriptionQueue: Queue<SubscriptionJobData> | null = null
let subscriptionWorker: Worker<SubscriptionJobData> | null = null

const QUEUE_NAME = 'subscription-lifecycle'

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000,
  },
  removeOnComplete: {
    age: 24 * 60 * 60,
    count: 500,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60,
  },
}

export async function getSubscriptionQueue(): Promise<Queue<SubscriptionJobData> | null> {
  if (subscriptionQueue) return subscriptionQueue

  const available = await isRedisAvailable()
  if (!available) {
    console.warn('Redis not available for subscription queue')
    return null
  }

  subscriptionQueue = new Queue<SubscriptionJobData>(QUEUE_NAME, {
    connection: redis,
    defaultJobOptions,
  })

  return subscriptionQueue
}

// ============================================================================
// Worker
// ============================================================================

async function processSubscriptionJob(job: Job<SubscriptionJobData>): Promise<void> {
  const { type } = job.data

  switch (type) {
    case 'check_expirations':
      await handleCheckExpirations()
      break

    case 'check_grace_periods':
      await handleCheckGracePeriods()
      break

    case 'send_warning':
      await handleSendWarning(job.data)
      break

    case 'process_renewals':
      await handleProcessRenewals()
      break

    case 'retry_failed_payment':
      await handleRetryFailedPayment(job.data)
      break

    case 'recover_unprocessed_checkouts':
      await handleRecoverUnprocessedCheckouts()
      break

    default:
      console.warn(`Unknown subscription job type: ${type}`)
  }
}

// ============================================================================
// Job Handlers
// ============================================================================

/**
 * Find users whose billing period has expired and start grace period.
 */
async function handleCheckExpirations(): Promise<void> {
  const now = new Date()

  const expiredUsers = await prisma.user.findMany({
    where: {
      subscriptionStatus: { in: ['ACTIVE', 'UNSUBSCRIBED'] },
      planExpiresAt: { lte: now },
    },
    select: { id: true },
  })

  for (const user of expiredUsers) {
    try {
      await startGracePeriod(user.id, 7)
      console.log(`[subscription] Grace period started for user ${user.id}`)
    } catch (error) {
      console.error(`[subscription] Failed to start grace period for user ${user.id}:`, error)
    }
  }

  if (expiredUsers.length > 0) {
    console.log(`[subscription] Processed ${expiredUsers.length} expired subscriptions`)
  }
}

/**
 * Find users whose grace/downgrading period has expired and lock resources.
 * For DOWNGRADING (admin-initiated), looks up target plan from subscription history.
 * For GRACE_PERIOD (natural expiration), always downgrades to FREE.
 */
async function handleCheckGracePeriods(): Promise<void> {
  const now = new Date()

  const expiredGraceUsers = await prisma.user.findMany({
    where: {
      subscriptionStatus: { in: ['GRACE_PERIOD', 'DOWNGRADING'] },
      gracePeriodEndsAt: { lte: now },
    },
    select: { id: true, subscriptionStatus: true, downgradeReason: true, downgradeInitiatedBy: true },
  })

  for (const user of expiredGraceUsers) {
    try {
      // For admin-initiated DOWNGRADING, look up the target plan from history
      let targetPlan: 'FREE' | 'PRO' | 'TEAM' = 'FREE'
      if (user.subscriptionStatus === 'DOWNGRADING') {
        const lastDowngrade = await prisma.subscriptionHistory.findFirst({
          where: { userId: user.id, action: 'downgrade' },
          orderBy: { createdAt: 'desc' },
          select: { toPlan: true },
        })
        if (lastDowngrade?.toPlan === 'PRO' || lastDowngrade?.toPlan === 'TEAM') {
          targetPlan = lastDowngrade.toPlan
        }
      }

      await lockResources(
        user.id,
        targetPlan,
        user.downgradeReason || 'payment_failed',
        user.downgradeInitiatedBy || 'system',
      )

      // For paid→paid downgrades (e.g., TEAM→PRO), user needs to subscribe to the new plan
      if (targetPlan !== 'FREE') {
        if (user.downgradeReason === 'user_scheduled_downgrade') {
          // User-initiated: Stripe subscription was cancelled — give 7-day grace to subscribe to new plan
          const graceDays = 7
          const gracePeriodEndsAt = new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000)
          await prisma.user.update({
            where: { id: user.id },
            data: {
              subscriptionStatus: 'GRACE_PERIOD',
              gracePeriodEndsAt,
              cleanupScheduledAt: null,
              downgradeReason: 'needs_new_subscription',
              downgradeInitiatedBy: 'system',
            },
          })
          console.log(`[subscription] User downgrade complete: ${user.id} → ${targetPlan}, 7-day grace to subscribe`)
        } else {
          // Admin-initiated: Stripe subscription was re-priced, user is actively subscribed
          await prisma.user.update({
            where: { id: user.id },
            data: {
              subscriptionStatus: 'ACTIVE',
              cleanupScheduledAt: null,
            },
          })
        }
      }

      console.log(`[subscription] Resources locked for user ${user.id} (target: ${targetPlan}, status: ${targetPlan === 'FREE' ? 'LOCKED' : 'ACTIVE'})`)
    } catch (error) {
      console.error(`[subscription] Failed to lock resources for user ${user.id}:`, error)
    }
  }

  if (expiredGraceUsers.length > 0) {
    console.log(`[subscription] Locked ${expiredGraceUsers.length} users after grace period`)
  }
}

/**
 * Send warning emails/notifications at scheduled times.
 */
async function handleSendWarning(data: SubscriptionJobData): Promise<void> {
  if (!data.userId || !data.warningType) return

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      subscriptionStatus: true,
      planExpiresAt: true,
      gracePeriodEndsAt: true,
      _count: { select: { eventTypes: { where: { lockedByDowngrade: true } }, webhooks: { where: { lockedByDowngrade: true } } } },
    },
  })

  if (!user || !user.email) return

  const billingUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`
  const basePlanData: PlanEmailData = {
    userName: user.name || 'there',
    userEmail: user.email,
    currentPlan: user.plan,
    reactivateUrl: billingUrl,
    lockedEventCount: user._count.eventTypes,
    lockedWebhookCount: user._count.webhooks,
  }

  switch (data.warningType) {
    case 'expiring': {
      if (!['ACTIVE', 'UNSUBSCRIBED'].includes(user.subscriptionStatus)) return

      const expiresDate = user.planExpiresAt?.toLocaleDateString() ?? 'soon'
      await createNotification({
        userId: user.id,
        type: 'PLAN_EXPIRING_SOON',
        title: 'Plan expiring soon',
        message: `Your ${user.plan} plan expires on ${expiresDate}. Renew to keep your features.`,
      })
      await queueEmail({
        type: 'plan_expiring_warning',
        to: user.email,
        subject: `Your ${user.plan} plan expires soon`,
        planData: { ...basePlanData, expiresAt: expiresDate },
      })
      break
    }

    case 'grace_ending': {
      if (!['GRACE_PERIOD', 'DOWNGRADING'].includes(user.subscriptionStatus)) return

      const graceDate = user.gracePeriodEndsAt?.toLocaleDateString() ?? 'soon'
      const daysLeft = user.gracePeriodEndsAt
        ? Math.max(0, Math.ceil((user.gracePeriodEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
        : 0

      await createNotification({
        userId: user.id,
        type: 'PLAN_GRACE_PERIOD_ENDING',
        title: 'Grace period ending soon',
        message: `Your grace period ends ${daysLeft <= 1 ? 'tomorrow' : `in ${daysLeft} days`} (${graceDate}). Renew now or your features will be locked.`,
      })
      await queueEmail({
        type: 'grace_period_ending',
        to: user.email,
        subject: `Grace period ending ${daysLeft <= 1 ? 'tomorrow' : `in ${daysLeft} days`}`,
        planData: { ...basePlanData, gracePeriodEndsAt: graceDate },
      })
      break
    }

  }
}

// ============================================================================
// Renewal Handlers
// ============================================================================

const MAX_PAYMENT_RETRIES = 3
const RETRY_DELAYS_MS = [
  24 * 60 * 60 * 1000,  // Retry 1: +24 hours
  48 * 60 * 60 * 1000,  // Retry 2: +48 hours
  72 * 60 * 60 * 1000,  // Retry 3: +72 hours (then grace period)
]

/**
 * Process recurring renewals for users whose billing period is about to expire.
 * Runs every hour. Charges users with saved payment methods.
 */
async function handleProcessRenewals(): Promise<void> {
  const now = new Date()
  const lookAhead = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24h window

  // Find ACTIVE users whose plan expires within 24 hours and are on a paid plan
  const dueUsers = await prisma.user.findMany({
    where: {
      subscriptionStatus: 'ACTIVE',
      plan: { not: 'FREE' },
      planExpiresAt: { lte: lookAhead, gt: now }, // Due in next 24h (not already expired)
      stripeCustomerId: { not: null },
    },
    select: {
      id: true,
      plan: true,
      email: true,
      name: true,
      stripeCustomerId: true,
      planExpiresAt: true,
    },
  })

  if (dueUsers.length === 0) return

  console.log(`[renewal] Processing ${dueUsers.length} renewals`)

  for (const user of dueUsers) {
    // Skip if there's already a successful renewal payment for this period
    const existingRenewal = await prisma.payment.findFirst({
      where: {
        userId: user.id,
        type: 'renewal',
        status: 'succeeded',
        billingPeriodStart: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    })
    if (existingRenewal) continue

    const planConfig = await getPlanConfig(user.plan as 'PRO' | 'TEAM')
    if (!planConfig || planConfig.price === 0) continue

    try {
      const pi = await chargeCustomer(
        user.stripeCustomerId!,
        planConfig.price,
        planConfig.currency,
        {
          userId: user.id,
          planTier: user.plan,
          type: 'renewal',
        },
      )

      // Success — extend the plan
      const intervalDays = planConfig.intervalDays || 30
      await activateSubscription(user.id, user.plan as 'PRO' | 'TEAM', intervalDays, 'system')

      const periodStart = user.planExpiresAt ?? now
      const periodEnd = new Date(periodStart.getTime() + intervalDays * 24 * 60 * 60 * 1000)

      await prisma.user.update({
        where: { id: user.id },
        data: { lastPaymentAt: now },
      })

      await prisma.payment.create({
        data: {
          userId: user.id,
          amount: planConfig.price,
          currency: planConfig.currency,
          status: 'succeeded',
          stripePaymentIntentId: pi.id,
          stripeChargeId: typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id ?? null,
          planTier: user.plan,
          type: 'renewal',
          billingPeriodStart: periodStart,
          billingPeriodEnd: periodEnd,
        },
      })

      console.log(`[renewal] Renewed ${user.plan} for user ${user.id}`)

      // Send invoice email
      sendRenewalSuccessEmail(user, planConfig, periodStart, periodEnd).catch(console.error)
    } catch (error) {
      console.error(`[renewal] Payment failed for user ${user.id}:`, error)

      // Record the failed payment
      await prisma.payment.create({
        data: {
          userId: user.id,
          amount: planConfig.price,
          currency: planConfig.currency,
          status: 'failed',
          planTier: user.plan,
          type: 'renewal',
          failureReason: error instanceof Error ? error.message : 'Payment failed',
          billingPeriodStart: user.planExpiresAt ?? now,
        },
      })

      // Send payment failed email
      sendRenewalFailedEmail(user, planConfig, error instanceof Error ? error.message : 'Payment failed').catch(console.error)

      // Schedule retry
      await schedulePaymentRetry(user.id, 1)
    }
  }
}

/**
 * Retry a failed payment for a specific user.
 */
async function handleRetryFailedPayment(data: SubscriptionJobData): Promise<void> {
  if (!data.userId) return
  const attempt = data.attempt ?? 1

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
    select: {
      id: true,
      plan: true,
      email: true,
      name: true,
      subscriptionStatus: true,
      stripeCustomerId: true,
      planExpiresAt: true,
    },
  })

  if (!user || !user.stripeCustomerId) return
  // Don't retry if user already cancelled or is no longer active
  if (user.subscriptionStatus !== 'ACTIVE') return

  const planConfig = await getPlanConfig(user.plan as 'PRO' | 'TEAM')
  if (!planConfig || planConfig.price === 0) return

  try {
    const pi = await chargeCustomer(
      user.stripeCustomerId,
      planConfig.price,
      planConfig.currency,
      {
        userId: user.id,
        planTier: user.plan,
        type: 'renewal',
        retryAttempt: String(attempt),
      },
    )

    // Success on retry
    const intervalDays = planConfig.intervalDays || 30
    await activateSubscription(user.id, user.plan as 'PRO' | 'TEAM', intervalDays, 'system')

    const now = new Date()
    const periodStart = user.planExpiresAt ?? now
    const periodEnd = new Date(periodStart.getTime() + intervalDays * 24 * 60 * 60 * 1000)

    await prisma.user.update({
      where: { id: user.id },
      data: { lastPaymentAt: now },
    })

    await prisma.payment.create({
      data: {
        userId: user.id,
        amount: planConfig.price,
        currency: planConfig.currency,
        status: 'succeeded',
        stripePaymentIntentId: pi.id,
        stripeChargeId: typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id ?? null,
        planTier: user.plan,
        type: 'renewal',
        billingPeriodStart: periodStart,
        billingPeriodEnd: periodEnd,
        metadata: { retryAttempt: attempt },
      },
    })

    console.log(`[renewal] Retry ${attempt} succeeded for user ${user.id}`)

    // Send invoice email
    sendRenewalSuccessEmail(user, planConfig, periodStart, periodEnd).catch(console.error)
  } catch (error) {
    console.error(`[renewal] Retry ${attempt} failed for user ${user.id}:`, error)

    await prisma.payment.create({
      data: {
        userId: user.id,
        amount: planConfig.price,
        currency: planConfig.currency,
        status: 'failed',
        planTier: user.plan,
        type: 'renewal',
        failureReason: error instanceof Error ? error.message : 'Payment failed',
        metadata: { retryAttempt: attempt },
      },
    })

    // Only send failed email on final retry (avoid spamming)
    if (attempt >= MAX_PAYMENT_RETRIES) {
      sendRenewalFailedEmail(user, planConfig, error instanceof Error ? error.message : 'Payment failed').catch(console.error)
    }

    if (attempt < MAX_PAYMENT_RETRIES) {
      await schedulePaymentRetry(user.id, attempt + 1)
    } else {
      // All retries exhausted — start grace period
      console.log(`[renewal] All retries exhausted for user ${user.id}, starting grace period`)
      await startGracePeriod(user.id, 7)
    }
  }
}

// ============================================================================
// Checkout Recovery
// ============================================================================

/**
 * Recover unprocessed Stripe Checkout sessions.
 * Finds users who paid via Stripe Checkout but whose callback never completed
 * (browser closed, network failure, etc.). Runs every 30 minutes.
 */
async function handleRecoverUnprocessedCheckouts(): Promise<void> {
  const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000)

  // Find users who might have unprocessed checkouts:
  // They have a stripeCustomerId but are FREE or not ACTIVE
  const candidates = await prisma.user.findMany({
    where: {
      stripeCustomerId: { not: null },
      OR: [
        { plan: 'FREE' },
        { subscriptionStatus: { in: ['NONE', 'LOCKED'] } },
      ],
    },
    select: {
      id: true,
      plan: true,
      subscriptionStatus: true,
      stripeCustomerId: true,
      name: true,
      email: true,
    },
    take: 50, // Process in batches
  })

  if (candidates.length === 0) return

  let recovered = 0

  for (const user of candidates) {
    try {
      // List recent completed checkout sessions for this customer
      const sessions = await stripe.checkout.sessions.list({
        customer: user.stripeCustomerId!,
        status: 'complete',
        created: { gte: oneDayAgo },
        limit: 5,
        expand: ['data.payment_intent'],
      })

      for (const checkoutSession of sessions.data) {
        if (checkoutSession.mode !== 'payment') continue
        if (checkoutSession.metadata?.userId !== user.id) continue
        if (checkoutSession.payment_status !== 'paid') continue

        const planTier = checkoutSession.metadata?.planTier as PlanTier
        if (!planTier || !['PRO', 'TEAM'].includes(planTier)) continue

        const paymentIntent = checkoutSession.payment_intent as import('stripe').Stripe.PaymentIntent | null
        if (!paymentIntent?.id) continue

        // Check if already processed
        const existingPayment = await prisma.payment.findUnique({
          where: { stripePaymentIntentId: paymentIntent.id },
        })
        if (existingPayment) continue

        // Recover this session
        console.log(`[recover-bg] Recovering session ${checkoutSession.id} for user ${user.id}, plan ${planTier}`)

        const planConfig = await getPlanConfig(planTier)
        const intervalDays = planConfig?.intervalDays ?? 30

        await activateSubscription(user.id, planTier, intervalDays, 'stripe')

        // Save payment method
        if (typeof paymentIntent.payment_method === 'string') {
          try {
            await stripe.customers.update(user.stripeCustomerId!, {
              invoice_settings: { default_payment_method: paymentIntent.payment_method },
            })
            await prisma.user.update({
              where: { id: user.id },
              data: {
                stripePaymentMethodId: paymentIntent.payment_method,
                lastPaymentAt: new Date(),
              },
            })
          } catch (err) {
            console.error('[recover-bg] Failed to set payment method:', err)
          }
        }

        // Record payment
        const now = new Date()
        const periodEnd = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000)

        const payment = await prisma.payment.create({
          data: {
            userId: user.id,
            amount: checkoutSession.amount_total ?? 0,
            currency: checkoutSession.currency ?? 'usd',
            status: 'succeeded',
            stripePaymentIntentId: paymentIntent.id,
            stripeChargeId: typeof paymentIntent.latest_charge === 'string'
              ? paymentIntent.latest_charge
              : paymentIntent.latest_charge?.id ?? null,
            planTier,
            type: 'initial',
            billingPeriodStart: now,
            billingPeriodEnd: periodEnd,
            metadata: { recoveredByBackgroundJob: true },
          },
        })

        // Send invoice email
        if (user.email) {
          const cardInfo = await getCustomerPaymentMethod(user.stripeCustomerId!).catch(() => null)
          const invoiceNum = `TT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${payment.id.slice(-6).toUpperCase()}`
          queuePaymentSuccessEmail({
            userName: user.name || 'there',
            userEmail: user.email,
            planName: planConfig?.name ?? planTier,
            planTier,
            amount: payment.amount,
            currency: payment.currency,
            invoiceNumber: invoiceNum,
            paymentDate: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            billingPeriodStart: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            billingPeriodEnd: periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            cardLast4: cardInfo?.last4,
            cardBrand: cardInfo?.brand,
            paymentType: 'initial',
            updatePaymentUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
            billingUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
          }).catch(console.error)
        }

        recovered++
        break // One recovery per user per run
      }
    } catch (err) {
      console.error(`[recover-bg] Error checking user ${user.id}:`, err)
    }
  }

  if (recovered > 0) {
    console.log(`[recover-bg] Recovered ${recovered} unprocessed checkout sessions`)
  }
}

// ============================================================================
// Payment email helpers
// ============================================================================

interface RenewalUser {
  id: string
  plan: string
  email: string | null
  name: string | null
  stripeCustomerId: string | null
}

async function sendRenewalSuccessEmail(
  user: RenewalUser,
  planConfig: { name: string; price: number; currency: string },
  periodStart: Date,
  periodEnd: Date,
): Promise<void> {
  if (!user.email) return
  const now = new Date()
  const cardInfo = user.stripeCustomerId
    ? await getCustomerPaymentMethod(user.stripeCustomerId).catch(() => null)
    : null
  const invoiceNum = `TT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${user.id.slice(-6).toUpperCase()}-R`
  await queuePaymentSuccessEmail({
    userName: user.name || 'there',
    userEmail: user.email,
    planName: planConfig.name,
    planTier: user.plan,
    amount: planConfig.price,
    currency: planConfig.currency,
    invoiceNumber: invoiceNum,
    paymentDate: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    billingPeriodStart: periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    billingPeriodEnd: periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    cardLast4: cardInfo?.last4,
    cardBrand: cardInfo?.brand,
    paymentType: 'renewal',
    updatePaymentUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
    billingUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
  })
}

async function sendRenewalFailedEmail(
  user: RenewalUser,
  planConfig: { name: string; price: number; currency: string },
  failureReason: string,
): Promise<void> {
  if (!user.email) return
  const now = new Date()
  const cardInfo = user.stripeCustomerId
    ? await getCustomerPaymentMethod(user.stripeCustomerId).catch(() => null)
    : null
  await queuePaymentFailedEmail({
    userName: user.name || 'there',
    userEmail: user.email,
    planName: planConfig.name,
    planTier: user.plan,
    amount: planConfig.price,
    currency: planConfig.currency,
    invoiceNumber: '',
    paymentDate: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    cardLast4: cardInfo?.last4,
    cardBrand: cardInfo?.brand,
    paymentType: 'renewal',
    failureReason,
    updatePaymentUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
    billingUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
  })
}

/**
 * Schedule a payment retry job.
 */
async function schedulePaymentRetry(userId: string, attempt: number): Promise<void> {
  const queue = await getSubscriptionQueue()
  if (!queue) return

  const delay = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]

  await queue.add(
    `retry_payment:${userId}:${attempt}`,
    {
      type: 'retry_failed_payment',
      userId,
      attempt,
    },
    {
      delay,
      jobId: `retry_payment:${userId}:${attempt}`,
    },
  )

  console.log(`[renewal] Scheduled retry ${attempt} for user ${userId} in ${delay / 1000 / 3600}h`)
}

// ============================================================================
// Scheduling
// ============================================================================

/**
 * Schedule warning jobs for a user when their subscription state changes.
 * Called by subscription-lifecycle.ts after state transitions.
 */
export async function scheduleWarnings(
  userId: string,
  warningType: 'expiring' | 'grace_ending',
  dates: Date[],
): Promise<void> {
  const queue = await getSubscriptionQueue()
  if (!queue) return

  for (const date of dates) {
    const delay = Math.max(0, date.getTime() - Date.now())
    await queue.add(
      `warning:${warningType}:${userId}`,
      {
        type: 'send_warning',
        userId,
        warningType,
      },
      { delay, jobId: `warning:${warningType}:${userId}:${date.getTime()}` },
    )
  }
}

// ============================================================================
// Worker Initialization
// ============================================================================

export async function initSubscriptionWorker(): Promise<void> {
  if (subscriptionWorker) return

  const available = await isRedisAvailable()
  if (!available) return

  subscriptionWorker = new Worker<SubscriptionJobData>(
    QUEUE_NAME,
    processSubscriptionJob,
    {
      connection: redis,
      concurrency: 3,
    },
  )

  subscriptionWorker.on('completed', (job) => {
    if (job.data.type !== 'send_warning') {
      console.log(`[subscription] Job ${job.data.type} completed`)
    }
  })

  subscriptionWorker.on('failed', (job, error) => {
    console.error(`[subscription] Job ${job?.data.type} failed:`, error.message)
  })

  console.log('Subscription lifecycle worker initialized')
}

/**
 * Schedule repeatable subscription check jobs.
 */
export async function scheduleSubscriptionJobs(): Promise<void> {
  const queue = await getSubscriptionQueue()
  if (!queue) return

  // Check expirations every 15 minutes
  await queue.add(
    'check_expirations',
    { type: 'check_expirations' },
    {
      repeat: { every: 15 * 60 * 1000 },
      jobId: 'repeatable:check_expirations',
    },
  )

  // Check grace periods every 15 minutes
  await queue.add(
    'check_grace_periods',
    { type: 'check_grace_periods' },
    {
      repeat: { every: 15 * 60 * 1000 },
      jobId: 'repeatable:check_grace_periods',
    },
  )

  // Process recurring renewals every hour
  await queue.add(
    'process_renewals',
    { type: 'process_renewals' },
    {
      repeat: { every: 60 * 60 * 1000 },
      jobId: 'repeatable:process_renewals',
    },
  )

  // Recover unprocessed checkout sessions every 30 minutes
  await queue.add(
    'recover_unprocessed_checkouts',
    { type: 'recover_unprocessed_checkouts' },
    {
      repeat: { every: 30 * 60 * 1000 },
      jobId: 'repeatable:recover_unprocessed_checkouts',
    },
  )

  console.log('Subscription lifecycle jobs scheduled')
}
