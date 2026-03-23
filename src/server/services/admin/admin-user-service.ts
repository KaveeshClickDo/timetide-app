/**
 * Admin user management: get details, update (subscription lifecycle + fields), delete.
 *
 * Handles: subscription state machine transitions, plan upgrades/downgrades,
 * role/disable toggling, audit logging, and admin-specific validation.
 */

import prisma from '@/server/db/prisma'
import { logAdminAction } from '@/server/admin/admin-audit'
import {
  activateSubscription,
  adminDowngradeImmediate,
  adminDowngradeWithGrace,
  cancelDowngrade,
  SubscriptionError,
} from '@/server/billing/subscription-lifecycle'
import { TIER_ORDER, PLAN_LIMITS, type PlanTier } from '@/lib/pricing'

// ── Domain errors ─────────────────────────────────────────────────────────────

export class AdminUserNotFoundError extends Error {
  constructor() {
    super('User not found')
    this.name = 'AdminUserNotFoundError'
  }
}

export class AdminCannotDeleteAdminError extends Error {
  constructor() {
    super('Cannot delete an admin user')
    this.name = 'AdminCannotDeleteAdminError'
  }
}

export class AdminInvalidTransitionError extends Error {
  code = 'INVALID_TRANSITION'
  currentStatus: string
  currentPlan: string
  constructor(message: string, currentStatus: string, currentPlan: string) {
    super(message)
    this.name = 'AdminInvalidTransitionError'
    this.currentStatus = currentStatus
    this.currentPlan = currentPlan
  }
}

export class AdminSubscriptionError extends Error {
  code: string
  currentStatus: string
  currentPlan: string
  constructor(err: SubscriptionError) {
    super(err.message)
    this.name = 'AdminSubscriptionError'
    this.code = err.code
    this.currentStatus = err.currentStatus
    this.currentPlan = err.currentPlan
  }
}

export class AdminInvalidPlanError extends Error {
  constructor(message = 'Invalid targetPlan') {
    super(message)
    this.name = 'AdminInvalidPlanError'
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_ADMIN_TRANSITIONS: Record<string, string[]> = {
  upgrade: ['NONE', 'ACTIVE', 'UNSUBSCRIBED', 'GRACE_PERIOD', 'DOWNGRADING', 'LOCKED'],
  downgrade_immediate: ['ACTIVE', 'UNSUBSCRIBED', 'GRACE_PERIOD', 'DOWNGRADING'],
  downgrade_grace: ['ACTIVE', 'UNSUBSCRIBED'],
  cancel_downgrade: ['DOWNGRADING'],
}

function validateAdminTransition(
  planAction: string,
  currentStatus: string,
  currentPlan: string,
  targetPlan?: string,
): string | null {
  const allowedStatuses = VALID_ADMIN_TRANSITIONS[planAction]
  if (allowedStatuses && !allowedStatuses.includes(currentStatus)) {
    return `Cannot ${planAction.replace('_', ' ')}: user is in ${currentStatus} status`
  }
  if (planAction === 'upgrade' && targetPlan) {
    if (TIER_ORDER.indexOf(targetPlan as PlanTier) <= TIER_ORDER.indexOf(currentPlan as PlanTier)) {
      return `Cannot upgrade: ${targetPlan} is not higher than current plan ${currentPlan}`
    }
  }
  if ((planAction === 'downgrade_immediate' || planAction === 'downgrade_grace') && targetPlan) {
    if (TIER_ORDER.indexOf(targetPlan as PlanTier) >= TIER_ORDER.indexOf(currentPlan as PlanTier)) {
      return `Cannot downgrade: ${targetPlan} is not lower than current plan ${currentPlan}`
    }
  }
  return null
}

// ── Get admin user detail ────────────────────────────────────────────────────

export async function getAdminUserDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, name: true, username: true, image: true,
      plan: true, role: true, isDisabled: true, createdAt: true,
      timezone: true, onboardingCompleted: true, emailVerified: true,
      subscriptionStatus: true, planActivatedAt: true, planExpiresAt: true,
      gracePeriodEndsAt: true, cleanupScheduledAt: true,
      downgradeReason: true, downgradeInitiatedBy: true,
      password: true,
      accounts: { select: { provider: true } },
      _count: { select: { bookingsAsHost: true, eventTypes: true, teamMemberships: true } },
      eventTypes: {
        select: {
          id: true, title: true, slug: true, isActive: true, lockedByDowngrade: true,
          teamId: true,
          team: { select: { name: true, slug: true } },
          _count: { select: { bookings: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      bookingsAsHost: {
        select: {
          id: true, startTime: true, endTime: true, status: true,
          inviteeName: true, inviteeEmail: true,
          eventType: {
            select: {
              title: true,
              teamId: true,
              team: { select: { name: true } },
            },
          },
        },
        orderBy: { startTime: 'desc' },
        take: 50,
      },
      teamMemberships: {
        select: {
          role: true,
          team: { select: { id: true, name: true, slug: true } },
        },
      },
      calendars: {
        select: { id: true, provider: true, name: true, syncStatus: true },
      },
      webhooks: {
        select: {
          id: true, name: true, url: true, isActive: true,
          lockedByDowngrade: true, eventTriggers: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      supportTickets: {
        select: {
          id: true, subject: true, status: true, priority: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      subscriptionHistory: {
        select: {
          id: true, action: true, fromPlan: true, toPlan: true,
          fromStatus: true, toStatus: true, reason: true, initiatedBy: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!user) throw new AdminUserNotFoundError()

  const { password, accounts, ...rest } = user
  return {
    ...rest,
    hasPassword: !!password,
    authProviders: accounts.map((a: { provider: string }) => a.provider),
  }
}

// ── Update admin user ────────────────────────────────────────────────────────

export interface AdminUpdateUserInput {
  userId: string
  adminId: string
  data: {
    plan?: string
    planAction?: string
    gracePeriodDays?: number
    role?: string
    isDisabled?: boolean
  }
}

export async function updateAdminUser(input: AdminUpdateUserInput) {
  const { userId, adminId, data } = input

  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, role: true, isDisabled: true, email: true, subscriptionStatus: true },
  })
  if (!existingUser) throw new AdminUserNotFoundError()

  // Handle subscription lifecycle actions
  if (data.planAction) {
    const transitionError = validateAdminTransition(
      data.planAction,
      existingUser.subscriptionStatus,
      existingUser.plan,
      data.plan,
    )
    if (transitionError) {
      throw new AdminInvalidTransitionError(transitionError, existingUser.subscriptionStatus, existingUser.plan)
    }

    try {
      switch (data.planAction) {
        case 'upgrade': {
          if (!data.plan || data.plan === 'FREE') {
            throw new AdminInvalidPlanError('Plan is required for upgrade')
          }
          await activateSubscription(userId, data.plan as PlanTier, 30, `admin:${adminId}`)
          break
        }
        case 'downgrade_immediate': {
          const targetPlan = (data.plan as PlanTier) || 'FREE'
          await adminDowngradeImmediate(userId, adminId, targetPlan)
          break
        }
        case 'downgrade_grace': {
          const targetPlan = (data.plan as PlanTier) || 'FREE'
          await adminDowngradeWithGrace(userId, adminId, data.gracePeriodDays, targetPlan)
          break
        }
        case 'cancel_downgrade': {
          await cancelDowngrade(userId, `admin:${adminId}`)
          break
        }
      }

      await logAdminAction({
        adminId,
        action: 'UPDATE_USER',
        targetType: 'User',
        targetId: userId,
        details: {
          planAction: data.planAction,
          fromPlan: existingUser.plan,
          toPlan: data.plan || 'FREE',
          gracePeriodDays: data.gracePeriodDays,
          userEmail: existingUser.email,
        },
      })
    } catch (err: unknown) {
      if (err instanceof SubscriptionError) {
        throw new AdminSubscriptionError(err)
      }
      throw err
    }
  }

  // Handle direct plan change without planAction
  if (data.plan && !data.planAction && data.plan !== existingUser.plan) {
    const newPlan = data.plan as PlanTier
    const isUpgrade = TIER_ORDER.indexOf(newPlan) > TIER_ORDER.indexOf(existingUser.plan as PlanTier)
    const impliedAction = isUpgrade ? 'upgrade' : 'downgrade_immediate'

    const transitionError = validateAdminTransition(
      impliedAction,
      existingUser.subscriptionStatus,
      existingUser.plan,
      newPlan,
    )
    if (transitionError) {
      throw new AdminInvalidTransitionError(transitionError, existingUser.subscriptionStatus, existingUser.plan)
    }

    try {
      if (isUpgrade) {
        await activateSubscription(userId, newPlan, 30, `admin:${adminId}`)
      } else {
        await adminDowngradeImmediate(userId, adminId, newPlan)
      }

      await logAdminAction({
        adminId,
        action: 'UPDATE_USER',
        targetType: 'User',
        targetId: userId,
        details: {
          planAction: impliedAction,
          fromPlan: existingUser.plan,
          toPlan: newPlan,
          userEmail: existingUser.email,
        },
      })
    } catch (err: unknown) {
      if (err instanceof SubscriptionError) {
        throw new AdminSubscriptionError(err)
      }
      throw err
    }
  }

  // Handle non-subscription field updates
  const directUpdates: Record<string, unknown> = {}
  if (data.role && data.role !== existingUser.role) directUpdates.role = data.role
  if (data.isDisabled !== undefined && data.isDisabled !== existingUser.isDisabled) {
    directUpdates.isDisabled = data.isDisabled
  }

  if (Object.keys(directUpdates).length > 0) {
    await prisma.user.update({ where: { id: userId }, data: directUpdates })

    const changes: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(directUpdates)) {
      changes[key] = { from: (existingUser as Record<string, unknown>)[key], to: value }
    }

    await logAdminAction({
      adminId,
      action: 'UPDATE_USER',
      targetType: 'User',
      targetId: userId,
      details: { changes, userEmail: existingUser.email },
    })
  }

  // Return updated user
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, name: true, plan: true, role: true, isDisabled: true,
      subscriptionStatus: true, planExpiresAt: true, gracePeriodEndsAt: true, cleanupScheduledAt: true,
    },
  })
}

// ── Delete admin user ────────────────────────────────────────────────────────

export async function deleteAdminUser(userId: string, adminId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true },
  })

  if (!user) throw new AdminUserNotFoundError()
  if (user.role === 'ADMIN') throw new AdminCannotDeleteAdminError()

  await prisma.user.delete({ where: { id: userId } })

  await logAdminAction({
    adminId,
    action: 'DELETE_USER',
    targetType: 'User',
    targetId: userId,
    details: { userEmail: user.email },
  })
}

// ── Dashboard stats ──────────────────────────────────────────────────────────

export async function getAdminDashboardStats() {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfWeek.getDate() - 7)
  const startOfMonth = new Date(startOfToday)
  startOfMonth.setDate(startOfMonth.getDate() - 30)

  const [
    totalUsers, newSignupsToday, newSignupsWeek, newSignupsMonth,
    totalBookings, bookingsToday, activeTeams, openTickets,
    planDistribution, recentSignups, recentBookings,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.user.count({ where: { createdAt: { gte: startOfWeek } } }),
    prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.booking.count(),
    prisma.booking.count({ where: { startTime: { gte: startOfToday } } }),
    prisma.team.count(),
    prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.user.groupBy({ by: ['plan'], _count: { plan: true } }),
    prisma.user.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, email: true, name: true, username: true, image: true,
        plan: true, role: true, isDisabled: true, emailVerified: true, createdAt: true,
        password: true,
        accounts: { select: { provider: true } },
        _count: { select: { bookingsAsHost: true, eventTypes: true, teamMemberships: true } },
      },
    }),
    prisma.booking.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, uid: true, startTime: true, endTime: true, status: true,
        inviteeName: true, inviteeEmail: true,
        host: { select: { id: true, name: true, email: true } },
        eventType: { select: { id: true, title: true } },
      },
    }),
  ])

  return {
    totalUsers, newSignupsToday, newSignupsWeek, newSignupsMonth,
    totalBookings, bookingsToday, activeTeams, openTickets,
    planDistribution: planDistribution.map((p) => ({ plan: p.plan, count: p._count.plan })),
    recentSignups: recentSignups.map(({ password, accounts, ...u }) => ({
      ...u,
      hasPassword: !!password,
      authProviders: accounts.map((a) => a.provider),
    })),
    recentBookings,
  }
}

// ── Downgrade preview ────────────────────────────────────────────────────────

export async function getDowngradePreview(userId: string, targetPlan: PlanTier) {
  if (!['FREE', 'PRO', 'TEAM'].includes(targetPlan)) {
    throw new AdminInvalidPlanError()
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, subscriptionStatus: true },
  })
  if (!user) throw new AdminUserNotFoundError()

  const targetLimits = PLAN_LIMITS[targetPlan]

  // Personal event types
  const personalEvents = await prisma.eventType.findMany({
    where: { userId, teamId: null },
    orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    select: { id: true, title: true, slug: true, isActive: true, lockedByDowngrade: true },
  })

  let personalToLock: typeof personalEvents = []
  if (targetLimits.maxEventTypes !== Infinity) {
    let activeKept = 0
    for (const et of personalEvents) {
      if (et.isActive && activeKept < targetLimits.maxEventTypes) {
        activeKept++
      } else if (et.isActive) {
        personalToLock.push(et)
      }
    }
  }

  // Webhooks
  const webhooks = await prisma.webhook.findMany({
    where: { userId, isActive: true },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, url: true },
  })

  let webhooksToLock: typeof webhooks = []
  if (targetLimits.maxWebhooks === 0) {
    webhooksToLock = webhooks
  } else if (targetLimits.maxWebhooks !== Infinity) {
    webhooksToLock = webhooks.slice(targetLimits.maxWebhooks)
  }

  // Team event types
  let teamEventsToLock: Array<{ id: string; title: string; teamName: string | null }> = []
  if (!targetLimits.teams) {
    const ownedTeams = await prisma.teamMember.findMany({
      where: { userId, role: 'OWNER' },
      select: { teamId: true, team: { select: { name: true } } },
    })
    const ownedTeamIds = ownedTeams.map((t) => t.teamId)

    if (ownedTeamIds.length > 0) {
      const rawTeamEvents = await prisma.eventType.findMany({
        where: { teamId: { in: ownedTeamIds }, isActive: true },
        select: { id: true, title: true, team: { select: { name: true } } },
      })
      teamEventsToLock = rawTeamEvents.map((et) => ({
        id: et.id,
        title: et.title,
        teamName: et.team?.name || null,
      }))
    }
  }

  // Features lost
  const currentLimits = PLAN_LIMITS[user.plan as PlanTier]
  const booleanFeatures = ['customQuestions', 'groupBooking', 'recurringBooking', 'teams', 'analytics'] as const
  const featuresLost = booleanFeatures.filter(
    (f) => currentLimits[f] === true && targetLimits[f] === false,
  )

  return {
    targetPlan,
    currentPlan: user.plan,
    personalEventTypes: {
      active: personalEvents.filter((e) => e.isActive).length,
      toLock: personalToLock.length,
      toKeep: Math.min(
        personalEvents.filter((e) => e.isActive).length,
        targetLimits.maxEventTypes === Infinity ? Infinity : targetLimits.maxEventTypes,
      ),
      items: personalToLock.map((e) => ({ id: e.id, title: e.title, slug: e.slug })),
    },
    webhooks: {
      active: webhooks.length,
      toLock: webhooksToLock.length,
      toKeep: webhooks.length - webhooksToLock.length,
      items: webhooksToLock.map((w) => ({ id: w.id, name: w.name, url: w.url })),
    },
    teamEventTypes: {
      active: teamEventsToLock.length,
      toLock: teamEventsToLock.length,
      items: teamEventsToLock,
    },
    featuresLost,
  }
}
