/**
 * Team CRUD operations: list, create, get, update, delete.
 *
 * Handles: team listing with role enrichment, slug generation with
 * collision detection, feature gating, owner plan validation,
 * slug uniqueness checks, and audit logging.
 */

import prisma from '@/server/db/prisma'
import { MAX_LIST_LIMIT } from '@/server/api-constants'
import { checkTeamAccess } from '@/server/teams/team-access'
import { logTeamAction } from '@/server/teams/team-audit'
import { checkFeatureAccess, checkSubscriptionNotLocked } from '@/server/billing/plan-enforcement'
import { PLAN_LIMITS } from '@/lib/pricing'
import type { PlanTier } from '@/lib/pricing'

// ── Domain errors ─────────────────────────────────────────────────────────────

export class TeamNotFoundError extends Error {
  constructor() {
    super('Team not found')
    this.name = 'TeamNotFoundError'
  }
}

export class TeamNotAuthorizedError extends Error {
  constructor(message = 'Not authorized') {
    super(message)
    this.name = 'TeamNotAuthorizedError'
  }
}

export class TeamSlugTakenError extends Error {
  constructor() {
    super('This slug is already taken')
    this.name = 'TeamSlugTakenError'
  }
}

export class TeamFeatureDeniedError extends Error {
  constructor(message = 'Feature not available on current plan') {
    super(message)
    this.name = 'TeamFeatureDeniedError'
  }
}

export class TeamSubscriptionLockedError extends Error {
  constructor() {
    super('Subscription is locked')
    this.name = 'TeamSubscriptionLockedError'
  }
}

// ── List teams ────────────────────────────────────────────────────────────────

export async function listTeams(userId: string) {
  const teams = await prisma.team.findMany({
    where: {
      members: { some: { userId } },
    },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      },
      _count: { select: { eventTypes: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_LIST_LIMIT,
  })

  return teams.map((team) => {
    const membership = team.members.find((m) => m.userId === userId)
    return { ...team, currentUserRole: membership?.role }
  })
}

// ── Create team ───────────────────────────────────────────────────────────────

export interface CreateTeamInput {
  name: string
  slug?: string
  userId: string
}

export async function createTeam(input: CreateTeamInput) {
  const { name, slug, userId } = input

  // Read plan from DB (not session JWT) to prevent stale bypass
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, subscriptionStatus: true },
  })
  const plan = (dbUser?.plan as PlanTier) || 'FREE'

  // Block LOCKED users
  const lockedDenied = checkSubscriptionNotLocked(dbUser?.subscriptionStatus)
  if (lockedDenied) throw new TeamSubscriptionLockedError()

  const featureDenied = checkFeatureAccess(plan, 'teams')
  if (featureDenied) throw new TeamFeatureDeniedError()

  // Generate unique slug
  let teamSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  let counter = 1
  while (await prisma.team.findUnique({ where: { slug: teamSlug } })) {
    teamSlug = `${slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${counter}`
    counter++
  }

  const team = await prisma.team.create({
    data: {
      name,
      slug: teamSlug,
      members: {
        create: { userId, role: 'OWNER' },
      },
    },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      },
    },
  })

  return team
}

// ── Get team details ──────────────────────────────────────────────────────────

export async function getTeamDetails(teamId: string, sessionUserId: string) {
  const membership = await checkTeamAccess(teamId, sessionUserId)
  if (!membership) throw new TeamNotFoundError()

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true, username: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      eventTypes: {
        include: { _count: { select: { bookings: true } } },
      },
    },
  })

  // Check if team owner has an active plan that supports teams
  const ownerMembership = await prisma.teamMember.findFirst({
    where: { teamId, role: 'OWNER' },
    select: {
      user: { select: { plan: true, subscriptionStatus: true } },
    },
  })
  const ownerPlan = ownerMembership?.user?.plan ?? 'FREE'
  const ownerStatus = ownerMembership?.user?.subscriptionStatus ?? 'NONE'
  const ownerPlanActive =
    !!PLAN_LIMITS[ownerPlan as keyof typeof PLAN_LIMITS]?.teams &&
    (ownerStatus === 'ACTIVE' || ownerStatus === 'DOWNGRADING')

  return { team, currentUserRole: membership.role, ownerPlanActive }
}

// ── Update team ───────────────────────────────────────────────────────────────

export interface UpdateTeamInput {
  teamId: string
  sessionUserId: string
  name?: string
  slug?: string
  logo?: string | null
}

export async function updateTeam(input: UpdateTeamInput) {
  const { teamId, sessionUserId, name, slug, logo } = input

  const membership = await checkTeamAccess(teamId, sessionUserId, 'ADMIN')
  if (!membership) throw new TeamNotAuthorizedError()

  // Check slug uniqueness if changing
  if (slug) {
    const existing = await prisma.team.findFirst({
      where: { slug, NOT: { id: teamId } },
    })
    if (existing) throw new TeamSlugTakenError()
  }

  const team = await prisma.team.update({
    where: { id: teamId },
    data: {
      ...(name && { name }),
      ...(slug && { slug }),
      ...(logo !== undefined && { logo }),
    },
  })

  logTeamAction({
    teamId,
    userId: sessionUserId,
    action: 'team.updated',
    targetType: 'Team',
    targetId: teamId,
    changes: { name, slug, logo },
  }).catch((err) => console.error('Failed to log team action:', err))

  return team
}

// ── Delete team ───────────────────────────────────────────────────────────────

export async function deleteTeam(teamId: string, sessionUserId: string) {
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: sessionUserId } },
  })

  if (!membership || membership.role !== 'OWNER') {
    throw new TeamNotAuthorizedError()
  }

  await prisma.team.delete({ where: { id: teamId } })
}
