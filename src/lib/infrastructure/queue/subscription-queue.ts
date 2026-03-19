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
} from '@/lib/subscription-lifecycle'
import { createNotification } from '@/lib/notifications'
import { queueEmail } from './email-queue'
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

  console.log('Subscription lifecycle jobs scheduled')
}
