/**
 * Subscription Lifecycle Manager
 *
 * Central orchestrator for all plan state transitions.
 * All subscription changes should go through this module.
 *
 * State machine:
 *   NONE → ACTIVE → UNSUBSCRIBED → GRACE_PERIOD → LOCKED → NONE
 *   ACTIVE → DOWNGRADING → LOCKED → NONE
 *   Any paid state → ACTIVE (reactivation)
 */

import prisma from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { createNotification } from '@/lib/notifications'
import type { PlanTier } from '@/lib/pricing'
import { PLAN_LIMITS } from '@/lib/pricing'

// Lazy imports to avoid circular dependency with queue → lifecycle → queue
async function lazyScheduleWarnings(
  userId: string,
  warningType: 'expiring' | 'grace_ending' | 'cleanup_warning',
  dates: Date[],
): Promise<void> {
  try {
    const { scheduleWarnings } = await import('@/lib/infrastructure/queue/subscription-queue')
    await scheduleWarnings(userId, warningType, dates)
  } catch {
    console.warn(`[subscription] Could not schedule ${warningType} warnings for ${userId}`)
  }
}

async function enqueuePlanEmail(
  type: import('@/types/queue').EmailJobType,
  to: string,
  subject: string,
  planData: import('@/types/queue').PlanEmailData,
): Promise<void> {
  try {
    const { queueEmail } = await import('@/lib/infrastructure/queue/email-queue')
    await queueEmail({ type, to, subject, planData })
    console.log(`[subscription] Queued ${type} email to ${to}`)
  } catch (error) {
    // Email queue not available (e.g., Redis down) — non-fatal
    console.error(`[subscription] Could not queue ${type} email to ${to}:`, error)
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SubscriptionAction =
  | 'upgrade'
  | 'downgrade'
  | 'unsubscribe'
  | 'grace_start'
  | 'locked'
  | 'cleanup'
  | 'reactivate'

interface LogHistoryParams {
  userId: string
  action: SubscriptionAction
  fromPlan: string
  toPlan: string
  fromStatus: string
  toStatus: string
  reason?: string
  initiatedBy: string
  metadata?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// History logging
// ---------------------------------------------------------------------------

async function logSubscriptionHistory(params: LogHistoryParams): Promise<void> {
  try {
    await prisma.subscriptionHistory.create({
      data: {
        userId: params.userId,
        action: params.action,
        fromPlan: params.fromPlan,
        toPlan: params.toPlan,
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        reason: params.reason ?? null,
        initiatedBy: params.initiatedBy,
        metadata: params.metadata
          ? (params.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    })
  } catch (error) {
    console.error('Failed to log subscription history:', error)
  }
}

// ---------------------------------------------------------------------------
// Core lifecycle functions
// ---------------------------------------------------------------------------

/**
 * Activate a paid subscription.
 * Called when user subscribes or admin upgrades.
 * If user was LOCKED, reactivates locked resources.
 */
export async function activateSubscription(
  userId: string,
  plan: PlanTier,
  billingPeriodDays = 30,
  initiatedBy = 'system',
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      subscriptionStatus: true,
    },
  })

  if (!user) throw new Error('User not found')

  const wasLocked = user.subscriptionStatus === 'LOCKED'
  const now = new Date()
  const expiresAt = new Date(now.getTime() + billingPeriodDays * 24 * 60 * 60 * 1000)

  await prisma.user.update({
    where: { id: userId },
    data: {
      plan,
      subscriptionStatus: 'ACTIVE',
      planActivatedAt: now,
      planExpiresAt: expiresAt,
      gracePeriodEndsAt: null,
      cleanupScheduledAt: null,
      downgradeReason: null,
      downgradeInitiatedBy: null,
    },
  })

  // Reactivate locked resources if upgrading from LOCKED state
  if (wasLocked) {
    await reactivateResources(userId)
  }

  await logSubscriptionHistory({
    userId,
    action: wasLocked ? 'reactivate' : 'upgrade',
    fromPlan: user.plan,
    toPlan: plan,
    fromStatus: user.subscriptionStatus,
    toStatus: 'ACTIVE',
    reason: wasLocked ? 'Reactivated subscription' : `Upgraded to ${plan}`,
    initiatedBy,
    metadata: { billingPeriodDays, expiresAt: expiresAt.toISOString() },
  })

  await createNotification({
    userId,
    type: 'PLAN_REACTIVATED',
    title: wasLocked ? 'Subscription reactivated' : `Upgraded to ${plan}`,
    message: wasLocked
      ? `Your ${plan} features have been restored. All locked resources are now active again.`
      : `Your ${plan} plan is active until ${expiresAt.toLocaleDateString()}.`,
  })

  // Schedule "plan expiring" warning 3 days before planExpiresAt
  const warningDate = new Date(expiresAt.getTime() - 3 * 24 * 60 * 60 * 1000)
  if (warningDate > now) {
    await lazyScheduleWarnings(userId, 'expiring', [warningDate])
  }

  // Send email
  const dbEmail = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } })
  if (dbEmail?.email) {
    await enqueuePlanEmail(
      'plan_reactivated',
      dbEmail.email,
      wasLocked ? 'Welcome back! Your features are restored' : `Your ${plan} plan is now active`,
      {
        userName: dbEmail.name || 'there',
        userEmail: dbEmail.email,
        currentPlan: plan,
        expiresAt: expiresAt.toLocaleDateString(),
        reactivateUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      },
    )
  }
}

/**
 * Voluntary unsubscribe.
 * User keeps access until planExpiresAt (already paid period).
 */
export async function voluntaryUnsubscribe(
  userId: string,
  initiatedBy = 'user',
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, subscriptionStatus: true, planExpiresAt: true },
  })

  if (!user) throw new Error('User not found')
  if (user.subscriptionStatus !== 'ACTIVE') {
    throw new Error(`Cannot unsubscribe from status: ${user.subscriptionStatus}`)
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: 'UNSUBSCRIBED',
      downgradeReason: 'voluntary_unsub',
      downgradeInitiatedBy: initiatedBy,
    },
  })

  await logSubscriptionHistory({
    userId,
    action: 'unsubscribe',
    fromPlan: user.plan,
    toPlan: user.plan,
    fromStatus: 'ACTIVE',
    toStatus: 'UNSUBSCRIBED',
    reason: 'Voluntary cancellation',
    initiatedBy,
  })

  const expiresDate = user.planExpiresAt
    ? user.planExpiresAt.toLocaleDateString()
    : 'the end of your billing period'

  await createNotification({
    userId,
    type: 'PLAN_DOWNGRADED',
    title: 'Subscription cancelled',
    message: `Your ${user.plan} plan will remain active until ${expiresDate}. You can reactivate anytime.`,
  })

  // Send cancellation confirmation email
  const dbEmail = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } })
  if (dbEmail?.email) {
    await enqueuePlanEmail('plan_expiring_warning', dbEmail.email, `Your ${user.plan} subscription has been cancelled`, {
      userName: dbEmail.name || 'there',
      userEmail: dbEmail.email,
      currentPlan: user.plan,
      expiresAt: expiresDate,
      reactivateUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
    })
  }
}

/**
 * Start grace period after billing period expires without renewal.
 * Called by background job when planExpiresAt passes.
 */
export async function startGracePeriod(
  userId: string,
  graceDays = 7,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, subscriptionStatus: true },
  })

  if (!user) return
  if (!['ACTIVE', 'UNSUBSCRIBED'].includes(user.subscriptionStatus)) return

  const now = new Date()
  const gracePeriodEndsAt = new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000)

  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: 'GRACE_PERIOD',
      gracePeriodEndsAt,
      downgradeReason: user.subscriptionStatus === 'UNSUBSCRIBED'
        ? 'voluntary_unsub'
        : 'payment_failed',
      downgradeInitiatedBy: 'system',
    },
  })

  await logSubscriptionHistory({
    userId,
    action: 'grace_start',
    fromPlan: user.plan,
    toPlan: user.plan,
    fromStatus: user.subscriptionStatus,
    toStatus: 'GRACE_PERIOD',
    reason: `${graceDays}-day grace period started`,
    initiatedBy: 'system',
    metadata: { graceDays, gracePeriodEndsAt: gracePeriodEndsAt.toISOString() },
  })

  await createNotification({
    userId,
    type: 'PLAN_GRACE_PERIOD_STARTED',
    title: 'Billing period ended',
    message: `Your billing period has ended. You have ${graceDays} days to renew before your ${user.plan} features are locked.`,
  })

  // Schedule "grace ending" warnings 2 days and 1 day before gracePeriodEndsAt
  const graceWarningDates = [2, 1]
    .map((d) => new Date(gracePeriodEndsAt.getTime() - d * 24 * 60 * 60 * 1000))
    .filter((d) => d > now)
  if (graceWarningDates.length > 0) {
    await lazyScheduleWarnings(userId, 'grace_ending', graceWarningDates)
  }

  // Send grace period started email
  const dbEmail = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } })
  if (dbEmail?.email) {
    await enqueuePlanEmail('grace_period_started', dbEmail.email, 'Action needed: Renew your subscription', {
      userName: dbEmail.name || 'there',
      userEmail: dbEmail.email,
      currentPlan: user.plan,
      gracePeriodEndsAt: gracePeriodEndsAt.toLocaleDateString(),
      reactivateUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
    })
  }
}

/**
 * Admin downgrade: immediately lock features exceeding target plan.
 * targetPlan defaults to FREE if not specified.
 *
 * For paid→paid downgrades (e.g., TEAM→PRO), the user keeps an ACTIVE
 * subscription at the target plan. Excess resources are still locked but
 * no cleanup is scheduled — they're preserved for potential re-upgrade.
 *
 * For paid→FREE, the user enters LOCKED state with 7-day cleanup.
 */
export async function adminDowngradeImmediate(
  userId: string,
  adminId: string,
  targetPlan: PlanTier = 'FREE',
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, subscriptionStatus: true },
  })

  if (!user) throw new Error('User not found')

  // lockResources sets plan + LOCKED status + schedules cleanup
  // For paid→paid downgrades, skip lockResources notifications — we send our own admin downgrade email
  const isPaidToPaid = targetPlan !== 'FREE'
  const lockedCounts = await lockResources(userId, targetPlan, 'admin_immediate', `admin:${adminId}`, isPaidToPaid)

  // For paid→paid downgrades, override to ACTIVE — user has a valid subscription
  if (isPaidToPaid) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: 'ACTIVE',
        cleanupScheduledAt: null, // No auto-cleanup — preserved for potential re-upgrade
      },
    })
  }

  await createNotification({
    userId,
    type: 'PLAN_DOWNGRADED',
    title: 'Plan downgraded',
    message: targetPlan === 'FREE'
      ? `An administrator has downgraded your plan. Features exceeding your new plan have been locked. You have 7 days to reactivate before data is deleted.`
      : `An administrator has downgraded your plan to ${targetPlan}. Features exceeding your new plan limits have been deactivated.`,
  })

  // Send admin downgrade email
  const dbEmail = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } })
  if (dbEmail?.email) {
    await enqueuePlanEmail('admin_downgrade_notice', dbEmail.email, 'Your plan has been changed', {
      userName: dbEmail.name || 'there',
      userEmail: dbEmail.email,
      currentPlan: user.plan,
      newPlan: targetPlan,
      reactivateUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
    })
  }
}

/**
 * Admin downgrade with grace period.
 * Default: remaining days in billing period, or specified days.
 * targetPlan defaults to FREE if not specified.
 */
export async function adminDowngradeWithGrace(
  userId: string,
  adminId: string,
  graceDays?: number,
  targetPlan: PlanTier = 'FREE',
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, subscriptionStatus: true, planExpiresAt: true },
  })

  if (!user) throw new Error('User not found')

  const now = new Date()

  // Default: remaining days in billing period or 30 days
  let effectiveGraceDays = graceDays
  if (!effectiveGraceDays) {
    if (user.planExpiresAt && user.planExpiresAt > now) {
      effectiveGraceDays = Math.max(
        1,
        Math.ceil((user.planExpiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
      )
    } else {
      effectiveGraceDays = 30
    }
  }

  const gracePeriodEndsAt = new Date(now.getTime() + effectiveGraceDays * 24 * 60 * 60 * 1000)

  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: 'DOWNGRADING',
      gracePeriodEndsAt,
      downgradeReason: 'admin_grace',
      downgradeInitiatedBy: `admin:${adminId}`,
    },
  })

  await logSubscriptionHistory({
    userId,
    action: 'downgrade',
    fromPlan: user.plan,
    toPlan: targetPlan,
    fromStatus: user.subscriptionStatus,
    toStatus: 'DOWNGRADING',
    reason: `Admin grace period: ${effectiveGraceDays} days → ${targetPlan}`,
    initiatedBy: `admin:${adminId}`,
    metadata: { graceDays: effectiveGraceDays, targetPlan, gracePeriodEndsAt: gracePeriodEndsAt.toISOString() },
  })

  await createNotification({
    userId,
    type: 'PLAN_DOWNGRADED',
    title: 'Plan change scheduled',
    message: `An administrator has scheduled a plan change. Your ${user.plan} features will remain active until ${gracePeriodEndsAt.toLocaleDateString()}.`,
  })

  // Schedule "grace ending" warnings 2 days and 1 day before gracePeriodEndsAt
  const graceWarningDates = [2, 1]
    .map((d) => new Date(gracePeriodEndsAt.getTime() - d * 24 * 60 * 60 * 1000))
    .filter((d) => d > now)
  if (graceWarningDates.length > 0) {
    await lazyScheduleWarnings(userId, 'grace_ending', graceWarningDates)
  }

  // Send admin downgrade email
  const dbEmail = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } })
  if (dbEmail?.email) {
    await enqueuePlanEmail('admin_downgrade_notice', dbEmail.email, 'Your plan has been changed', {
      userName: dbEmail.name || 'there',
      userEmail: dbEmail.email,
      currentPlan: user.plan,
      newPlan: targetPlan,
      gracePeriodEndsAt: gracePeriodEndsAt.toLocaleDateString(),
      reactivateUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
    })
  }
}

/**
 * Cancel a pending downgrade (DOWNGRADING status).
 * Restores user to ACTIVE status with their current plan.
 */
export async function cancelDowngrade(
  userId: string,
  initiatedBy = 'system',
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, subscriptionStatus: true, planExpiresAt: true },
  })

  if (!user) throw new Error('User not found')
  if (user.subscriptionStatus !== 'DOWNGRADING') {
    throw new Error(`Cannot cancel downgrade from status: ${user.subscriptionStatus}`)
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: 'ACTIVE',
      gracePeriodEndsAt: null,
      downgradeReason: null,
      downgradeInitiatedBy: null,
    },
  })

  await logSubscriptionHistory({
    userId,
    action: 'reactivate',
    fromPlan: user.plan,
    toPlan: user.plan,
    fromStatus: 'DOWNGRADING',
    toStatus: 'ACTIVE',
    reason: 'Downgrade cancelled',
    initiatedBy,
  })

  await createNotification({
    userId,
    type: 'PLAN_REACTIVATED',
    title: 'Downgrade cancelled',
    message: `Your scheduled downgrade has been cancelled. Your ${user.plan} plan remains active.`,
  })

  // Send cancel downgrade email
  const dbEmail = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } })
  if (dbEmail?.email) {
    await enqueuePlanEmail('plan_reactivated', dbEmail.email, `Your ${user.plan} downgrade has been cancelled`, {
      userName: dbEmail.name || 'there',
      userEmail: dbEmail.email,
      currentPlan: user.plan,
      expiresAt: user.planExpiresAt?.toLocaleDateString(),
      reactivateUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    })
  }
}

/**
 * Lock resources: deactivate event types and webhooks exceeding target plan limits.
 * Called when grace/downgrading period expires.
 * targetPlan determines what limits to enforce (e.g., TEAM→PRO keeps unlimited events but caps webhooks at 10).
 */
export async function lockResources(
  userId: string,
  targetPlan: PlanTier = 'FREE',
  reason = 'payment_failed',
  initiatedBy = 'system',
  /** Skip email/notification — caller will send its own (e.g., paid→paid admin downgrade) */
  skipNotifications = false,
): Promise<{ lockedPersonalEvents: number; lockedTeamEvents: number; lockedWebhookCount: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, subscriptionStatus: true },
  })

  if (!user) return { lockedPersonalEvents: 0, lockedTeamEvents: 0, lockedWebhookCount: 0 }

  const now = new Date()
  const cleanupScheduledAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const targetLimits = PLAN_LIMITS[targetPlan]

  // --- Lock excess EVENT TYPES ---
  const eventIdsToLock: string[] = []

  if (targetLimits.maxEventTypes !== Infinity) {
    const eventTypes = await prisma.eventType.findMany({
      where: { userId, teamId: null },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
      select: { id: true, isActive: true },
    })

    let activeKept = 0
    for (const et of eventTypes) {
      if (et.isActive && activeKept < targetLimits.maxEventTypes) {
        activeKept++
      } else if (et.isActive) {
        eventIdsToLock.push(et.id)
      }
    }

    if (eventIdsToLock.length > 0) {
      await prisma.eventType.updateMany({
        where: { id: { in: eventIdsToLock } },
        data: { isActive: false, lockedByDowngrade: true },
      })
    }
  }
  // If targetPlan allows Infinity event types (e.g., PRO), no events get locked

  // --- Lock excess WEBHOOKS ---
  let lockedWebhookCount = 0

  if (targetLimits.maxWebhooks === 0) {
    // Lock ALL webhooks (e.g., downgrade to FREE)
    const result = await prisma.webhook.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false, lockedByDowngrade: true },
    })
    lockedWebhookCount = result.count
  } else if (targetLimits.maxWebhooks !== Infinity) {
    // Lock webhooks exceeding the target limit (e.g., TEAM→PRO: keep 10, lock rest)
    const webhooks = await prisma.webhook.findMany({
      where: { userId, isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    })

    const webhookIdsToLock = webhooks.slice(targetLimits.maxWebhooks).map((w) => w.id)
    if (webhookIdsToLock.length > 0) {
      await prisma.webhook.updateMany({
        where: { id: { in: webhookIdsToLock } },
        data: { isActive: false, lockedByDowngrade: true },
      })
      lockedWebhookCount = webhookIdsToLock.length
    }
  }
  // If targetPlan allows Infinity webhooks, none get locked

  // --- Lock TEAM event types if target plan doesn't support teams ---
  // Lock ALL event types in teams owned by this user (not just ones they created)
  let lockedTeamEvents = 0
  const ownedTeamIds: string[] = []
  if (!targetLimits.teams) {
    const ownedTeams = await prisma.teamMember.findMany({
      where: { userId, role: 'OWNER' },
      select: { teamId: true },
    })
    ownedTeamIds.push(...ownedTeams.map((t) => t.teamId))

    if (ownedTeamIds.length > 0) {
      const result = await prisma.eventType.updateMany({
        where: { teamId: { in: ownedTeamIds }, isActive: true },
        data: { isActive: false, lockedByDowngrade: true },
      })
      lockedTeamEvents = result.count

      // Notify team members
      const teamMembers = await prisma.teamMember.findMany({
        where: { teamId: { in: ownedTeamIds }, userId: { not: userId } },
        select: { userId: true },
      })
      for (const member of teamMembers) {
        await createNotification({
          userId: member.userId,
          type: 'PLAN_DOWNGRADED',
          title: 'Team features unavailable',
          message: 'The team owner\'s subscription has changed. Team features are temporarily unavailable until the owner reactivates their plan.',
        })
      }
    }
  }

  // Update user status
  await prisma.user.update({
    where: { id: userId },
    data: {
      plan: targetPlan,
      subscriptionStatus: 'LOCKED',
      cleanupScheduledAt,
      downgradeReason: reason,
      downgradeInitiatedBy: initiatedBy,
    },
  })

  const lockedPersonalEvents = eventIdsToLock.length
  const totalLockedEvents = lockedPersonalEvents + lockedTeamEvents

  await logSubscriptionHistory({
    userId,
    action: 'locked',
    fromPlan: user.plan,
    toPlan: targetPlan,
    fromStatus: user.subscriptionStatus,
    toStatus: 'LOCKED',
    reason: `Locked ${lockedPersonalEvents} personal events, ${lockedTeamEvents} team events, ${lockedWebhookCount} webhooks`,
    initiatedBy,
    metadata: {
      targetPlan,
      lockedPersonalEvents,
      lockedTeamEvents,
      lockedWebhooks: lockedWebhookCount,
      cleanupScheduledAt: cleanupScheduledAt.toISOString(),
    },
  })

  if (!skipNotifications) {
    const parts: string[] = []
    if (lockedPersonalEvents > 0) parts.push(`${lockedPersonalEvents} event type(s)`)
    if (lockedTeamEvents > 0) parts.push(`${lockedTeamEvents} team event type(s)`)
    if (lockedWebhookCount > 0) parts.push(`${lockedWebhookCount} webhook(s)`)
    const lockedSummary = parts.length > 0 ? parts.join(', ') : 'some resources'

    await createNotification({
      userId,
      type: 'PLAN_LOCKED',
      title: 'Features locked',
      message: `Features exceeding your ${targetPlan} plan have been locked. ${lockedSummary} deactivated. Reactivate within 7 days to keep your data.`,
    })

    // Schedule "cleanup warning" 2 days before cleanupScheduledAt
    const cleanupWarningDate = new Date(cleanupScheduledAt.getTime() - 2 * 24 * 60 * 60 * 1000)
    if (cleanupWarningDate > now) {
      await lazyScheduleWarnings(userId, 'cleanup_warning', [cleanupWarningDate])
    }

    // Send plan locked email
    const dbEmail = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } })
    if (dbEmail?.email) {
      await enqueuePlanEmail('plan_locked', dbEmail.email, `Your ${user.plan} features have been locked`, {
        userName: dbEmail.name || 'there',
        userEmail: dbEmail.email,
        currentPlan: user.plan,
        newPlan: targetPlan,
        cleanupScheduledAt: cleanupScheduledAt.toLocaleDateString(),
        lockedEventCount: lockedPersonalEvents || undefined,
        lockedTeamEventCount: lockedTeamEvents || undefined,
        lockedWebhookCount: lockedWebhookCount || undefined,
        reactivateUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
      })
    }
  }

  return { lockedPersonalEvents, lockedTeamEvents, lockedWebhookCount }
}

/**
 * Reactivate locked resources when user re-subscribes.
 */
export async function reactivateResources(userId: string): Promise<void> {
  // Reactivate all personal event types locked by downgrade
  await prisma.eventType.updateMany({
    where: { userId, lockedByDowngrade: true },
    data: { isActive: true, lockedByDowngrade: false },
  })

  // Reactivate all webhooks locked by downgrade
  await prisma.webhook.updateMany({
    where: { userId, lockedByDowngrade: true },
    data: { isActive: true, lockedByDowngrade: false },
  })

  // Reactivate team event types in teams owned by this user
  const ownedTeams = await prisma.teamMember.findMany({
    where: { userId, role: 'OWNER' },
    select: { teamId: true },
  })
  const ownedTeamIds = ownedTeams.map((t) => t.teamId)

  if (ownedTeamIds.length > 0) {
    await prisma.eventType.updateMany({
      where: { teamId: { in: ownedTeamIds }, lockedByDowngrade: true },
      data: { isActive: true, lockedByDowngrade: false },
    })

    // Notify team members that team is back
    const teamMembers = await prisma.teamMember.findMany({
      where: { teamId: { in: ownedTeamIds }, userId: { not: userId } },
      select: { userId: true },
    })
    for (const member of teamMembers) {
      await createNotification({
        userId: member.userId,
        type: 'PLAN_REACTIVATED',
        title: 'Team features restored',
        message: 'The team owner has reactivated their plan. Team features are available again.',
      })
    }
  }
}

/**
 * Cleanup: permanently delete locked resources.
 * Called 7 days after LOCKED state.
 * Preserves event types with future active bookings.
 */
export async function cleanupResources(userId: string): Promise<void> {
  // Use a transaction to avoid race conditions with reactivation
  await prisma.$transaction(async (tx) => {
    // Re-check status inside transaction
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { plan: true, subscriptionStatus: true },
    })

    if (!user || user.subscriptionStatus !== 'LOCKED') {
      // User was reactivated in the meantime, abort
      return
    }

    const now = new Date()

    // Find teams owned by this user (for cleaning up team event types)
    const ownedTeams = await tx.teamMember.findMany({
      where: { userId, role: 'OWNER' },
      select: { teamId: true },
    })
    const ownedTeamIds = ownedTeams.map((t) => t.teamId)

    // Delete personal event types that are locked AND have no future active bookings
    const lockedEvents = await tx.eventType.findMany({
      where: {
        lockedByDowngrade: true,
        isActive: false,
        OR: [
          { userId },
          ...(ownedTeamIds.length > 0 ? [{ teamId: { in: ownedTeamIds } }] : []),
        ],
      },
      select: {
        id: true,
        bookings: {
          where: {
            startTime: { gte: now },
            status: { in: ['PENDING', 'CONFIRMED'] },
          },
          select: { id: true },
          take: 1,
        },
      },
    })

    const eventsToDelete = lockedEvents
      .filter((et) => et.bookings.length === 0)
      .map((et) => et.id)

    const eventsPreserved = lockedEvents.length - eventsToDelete.length

    if (eventsToDelete.length > 0) {
      await tx.eventType.deleteMany({
        where: { id: { in: eventsToDelete } },
      })
    }

    // Delete locked webhooks
    const deletedWebhooks = await tx.webhook.deleteMany({
      where: {
        userId,
        lockedByDowngrade: true,
        isActive: false,
      },
    })

    // Update user status
    await tx.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: 'NONE',
        planActivatedAt: null,
        planExpiresAt: null,
        gracePeriodEndsAt: null,
        cleanupScheduledAt: null,
        downgradeReason: null,
        downgradeInitiatedBy: null,
      },
    })

    await tx.subscriptionHistory.create({
      data: {
        userId,
        action: 'cleanup',
        fromPlan: 'FREE',
        toPlan: 'FREE',
        fromStatus: 'LOCKED',
        toStatus: 'NONE',
        reason: `Deleted ${eventsToDelete.length} events, ${deletedWebhooks.count} webhooks${eventsPreserved > 0 ? `. ${eventsPreserved} events preserved (have future bookings)` : ''}`,
        initiatedBy: 'system',
        metadata: {
          deletedEventTypes: eventsToDelete.length,
          deletedWebhooks: deletedWebhooks.count,
          preservedEventTypes: eventsPreserved,
        } as unknown as Prisma.InputJsonValue,
      },
    })
  })

  await createNotification({
    userId,
    type: 'PLAN_CLEANUP_WARNING',
    title: 'Data cleanup complete',
    message: 'Your locked event types and webhooks have been permanently removed. Upgrade to create new ones.',
  })

  // Send cleanup complete email
  const dbEmail = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } })
  if (dbEmail?.email) {
    await enqueuePlanEmail('plan_cleanup_complete', dbEmail.email, 'Your extra resources have been removed', {
      userName: dbEmail.name || 'there',
      userEmail: dbEmail.email,
      currentPlan: 'FREE',
      newPlan: 'FREE',
      reactivateUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
    })
  }
}

/**
 * Get subscription summary for a user (used by admin panel).
 */
export async function getSubscriptionSummary(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      subscriptionStatus: true,
      planActivatedAt: true,
      planExpiresAt: true,
      gracePeriodEndsAt: true,
      cleanupScheduledAt: true,
      downgradeReason: true,
      downgradeInitiatedBy: true,
    },
  })

  if (!user) return null

  const [lockedEventTypes, lockedWebhooks, history] = await Promise.all([
    prisma.eventType.count({ where: { userId, lockedByDowngrade: true } }),
    prisma.webhook.count({ where: { userId, lockedByDowngrade: true } }),
    prisma.subscriptionHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ])

  return {
    ...user,
    lockedEventTypes,
    lockedWebhooks,
    history,
  }
}
