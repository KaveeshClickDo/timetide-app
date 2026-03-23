/**
 * Team invitation management: list, create, cancel.
 *
 * Handles: inviter name resolution, email normalization, duplicate
 * detection, expiry logic, invitation email queueing, and audit logging.
 */

import prisma from '@/server/db/prisma'
import { MAX_LIST_LIMIT } from '@/server/api-constants'
import { checkTeamAccess } from '@/server/teams/team-access'
import { logTeamAction } from '@/server/teams/team-audit'
import {
  checkFeatureAccess,
  getTeamOwnerPlan,
  checkSubscriptionNotLocked,
} from '@/server/billing/plan-enforcement'
import { queueTeamInvitationEmail } from '@/server/infrastructure/queue/email-queue'
import type { TeamMemberRole } from '@/generated/prisma/client'

// ── Domain errors ─────────────────────────────────────────────────────────────

export class InvitationNotAuthorizedError extends Error {
  constructor() {
    super('Not authorized')
    this.name = 'InvitationNotAuthorizedError'
  }
}

export class InvitationFeatureDeniedError extends Error {
  constructor() {
    super('Feature not available on current plan')
    this.name = 'InvitationFeatureDeniedError'
  }
}

export class InvitationSubscriptionLockedError extends Error {
  constructor() {
    super('Subscription is locked')
    this.name = 'InvitationSubscriptionLockedError'
  }
}

export class InvitationOwnerOnlyError extends Error {
  constructor() {
    super('Only owners can invite other owners')
    this.name = 'InvitationOwnerOnlyError'
  }
}

export class InvitationAlreadyMemberError extends Error {
  constructor() {
    super('This user is already a member of the team')
    this.name = 'InvitationAlreadyMemberError'
  }
}

export class InvitationAlreadySentError extends Error {
  constructor() {
    super('An invitation has already been sent to this email')
    this.name = 'InvitationAlreadySentError'
  }
}

export class InvitationTeamNotFoundError extends Error {
  constructor() {
    super('Team not found')
    this.name = 'InvitationTeamNotFoundError'
  }
}

export class InvitationNotFoundError extends Error {
  constructor() {
    super('Invitation not found')
    this.name = 'InvitationNotFoundError'
  }
}

export class InvitationNotPendingError extends Error {
  constructor() {
    super('Invitation is not pending')
    this.name = 'InvitationNotPendingError'
  }
}

// ── List invitations ──────────────────────────────────────────────────────────

export async function listTeamInvitations(teamId: string, sessionUserId: string) {
  const membership = await checkTeamAccess(teamId, sessionUserId, 'ADMIN')
  if (!membership) throw new InvitationNotAuthorizedError()

  const invitations = await prisma.teamInvitation.findMany({
    where: { teamId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    take: MAX_LIST_LIMIT,
  })

  // Resolve inviter names
  const inviterIds = Array.from(new Set(invitations.map((i) => i.invitedBy)))
  const inviters = await prisma.user.findMany({
    where: { id: { in: inviterIds } },
    select: { id: true, name: true, email: true },
  })
  const inviterMap = new Map(inviters.map((u) => [u.id, u]))

  return invitations.map((inv) => ({
    ...inv,
    inviter: inviterMap.get(inv.invitedBy) || null,
  }))
}

// ── Create invitation ─────────────────────────────────────────────────────────

export interface CreateInvitationInput {
  teamId: string
  sessionUserId: string
  sessionUserName?: string | null
  sessionUserEmail?: string | null
  email: string
  role: TeamMemberRole
}

export async function createTeamInvitation(input: CreateInvitationInput) {
  const { teamId, sessionUserId, sessionUserName, sessionUserEmail, email, role } = input

  const membership = await checkTeamAccess(teamId, sessionUserId, 'ADMIN')
  if (!membership) throw new InvitationNotAuthorizedError()

  // Enforce feature gate
  const { plan: ownerPlan, subscriptionStatus: ownerSubStatus } = await getTeamOwnerPlan(teamId)
  if (checkSubscriptionNotLocked(ownerSubStatus)) throw new InvitationSubscriptionLockedError()
  if (checkFeatureAccess(ownerPlan, 'teams')) throw new InvitationFeatureDeniedError()

  const normalizedEmail = email.toLowerCase()

  // Only owner can invite as owner
  if (role === 'OWNER' && membership.role !== 'OWNER') {
    throw new InvitationOwnerOnlyError()
  }

  // Check if already a team member
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  })

  if (existingUser) {
    const existingMembership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: existingUser.id } },
    })
    if (existingMembership) throw new InvitationAlreadyMemberError()
  }

  // Check for existing pending invitation
  const existingInvitation = await prisma.teamInvitation.findUnique({
    where: { teamId_email: { teamId, email: normalizedEmail } },
  })

  if (
    existingInvitation &&
    existingInvitation.status === 'PENDING' &&
    existingInvitation.expiresAt > new Date()
  ) {
    throw new InvitationAlreadySentError()
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { name: true, slug: true },
  })
  if (!team) throw new InvitationTeamNotFoundError()

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  const invitation = await prisma.teamInvitation.upsert({
    where: { teamId_email: { teamId, email: normalizedEmail } },
    create: {
      teamId,
      email: normalizedEmail,
      role,
      invitedBy: sessionUserId,
      expiresAt,
    },
    update: {
      role,
      status: 'PENDING',
      invitedBy: sessionUserId,
      expiresAt,
    },
  })

  // Send invitation email (fire-and-forget)
  const actorName = sessionUserName || sessionUserEmail || 'Someone'
  const roleName = role.charAt(0) + role.slice(1).toLowerCase()
  const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invitations/accept?token=${invitation.token}`

  try {
    await queueTeamInvitationEmail(normalizedEmail, {
      memberName: normalizedEmail,
      teamName: team.name,
      actorName,
      role: roleName,
      teamUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/teams/${teamId}`,
      expiresIn: '7 days',
      acceptUrl,
    })
  } catch (err) {
    console.error('Failed to send invitation email:', err)
  }

  logTeamAction({
    teamId,
    userId: sessionUserId,
    action: 'invitation.sent',
    targetType: 'TeamInvitation',
    targetId: invitation.id,
    changes: { email: normalizedEmail, role },
  }).catch((err) => console.error('Failed to log team action:', err))

  return invitation
}

// ── Cancel invitation ─────────────────────────────────────────────────────────

export async function cancelTeamInvitation(
  teamId: string,
  invitationId: string,
  sessionUserId: string
) {
  const membership = await checkTeamAccess(teamId, sessionUserId, 'ADMIN')
  if (!membership) throw new InvitationNotAuthorizedError()

  const invitation = await prisma.teamInvitation.findUnique({
    where: { id: invitationId },
  })

  if (!invitation || invitation.teamId !== teamId) throw new InvitationNotFoundError()
  if (invitation.status !== 'PENDING') throw new InvitationNotPendingError()

  await prisma.teamInvitation.update({
    where: { id: invitationId },
    data: { status: 'EXPIRED' },
  })

  logTeamAction({
    teamId,
    userId: sessionUserId,
    action: 'invitation.cancelled',
    targetType: 'TeamInvitation',
    targetId: invitationId,
    changes: { email: invitation.email },
  }).catch((err) => console.error('Failed to log team action:', err))
}
