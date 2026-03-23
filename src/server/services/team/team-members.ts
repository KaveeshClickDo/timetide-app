/**
 * Team member management: list, add, get, update, remove, bulk actions,
 * and integration status listing.
 *
 * Handles: role validation, owner safety checks, feature gating,
 * notifications, emails, and audit logging.
 */

import prisma from '@/server/db/prisma'
import { checkTeamAccess } from '@/server/teams/team-access'
import { logTeamAction } from '@/server/teams/team-audit'
import {
  checkFeatureAccess,
  getTeamOwnerPlan,
  checkSubscriptionNotLocked,
} from '@/server/billing/plan-enforcement'
import { createNotification, buildTeamNotification } from '@/server/notifications'
import { queueTeamMemberAddedEmail } from '@/server/infrastructure/queue/email-queue'
import type { TeamMemberRole } from '@/generated/prisma/client'

// ── Domain errors ─────────────────────────────────────────────────────────────

export class MemberNotFoundError extends Error {
  constructor() {
    super('Member not found')
    this.name = 'MemberNotFoundError'
  }
}

export class MemberNotAuthorizedError extends Error {
  constructor(message = 'Not authorized') {
    super(message)
    this.name = 'MemberNotAuthorizedError'
  }
}

export class MemberAlreadyExistsError extends Error {
  constructor() {
    super('User is already a member of this team')
    this.name = 'MemberAlreadyExistsError'
  }
}

export class MemberUserNotFoundError extends Error {
  constructor() {
    super('No user found with this email')
    this.name = 'MemberUserNotFoundError'
  }
}

export class MemberOnlyOwnerCanAddOwnerError extends Error {
  constructor() {
    super('Only owners can add other owners')
    this.name = 'MemberOnlyOwnerCanAddOwnerError'
  }
}

export class MemberLastOwnerError extends Error {
  constructor(message = 'Cannot remove or demote the last owner') {
    super(message)
    this.name = 'MemberLastOwnerError'
  }
}

export class MemberOwnerModifyError extends Error {
  constructor() {
    super('Only owners can modify other owners')
    this.name = 'MemberOwnerModifyError'
  }
}

export class MemberFeatureDeniedError extends Error {
  constructor() {
    super('Feature not available on current plan')
    this.name = 'MemberFeatureDeniedError'
  }
}

export class MemberSubscriptionLockedError extends Error {
  constructor() {
    super('Subscription is locked')
    this.name = 'MemberSubscriptionLockedError'
  }
}

export class MemberNoValidMembersError extends Error {
  constructor() {
    super('No valid members found')
    this.name = 'MemberNoValidMembersError'
  }
}

// ── List members ──────────────────────────────────────────────────────────────

export async function listTeamMembers(teamId: string, sessionUserId: string) {
  const membership = await checkTeamAccess(teamId, sessionUserId)
  if (!membership) throw new MemberNotAuthorizedError('Not a member of this team')

  return prisma.teamMember.findMany({
    where: { teamId },
    include: {
      user: {
        select: { id: true, name: true, email: true, image: true },
      },
      _count: { select: { assignments: true } },
    },
    orderBy: [{ role: 'asc' }, { priority: 'asc' }, { createdAt: 'asc' }],
  })
}

// ── Add member ────────────────────────────────────────────────────────────────

export interface AddTeamMemberInput {
  teamId: string
  sessionUserId: string
  sessionUserName?: string | null
  sessionUserEmail?: string | null
  email: string
  role?: TeamMemberRole
}

export async function addTeamMember(input: AddTeamMemberInput) {
  const { teamId, sessionUserId, sessionUserName, sessionUserEmail, email, role } = input

  const membership = await checkTeamAccess(teamId, sessionUserId, 'ADMIN')
  if (!membership) throw new MemberNotAuthorizedError()

  // Enforce feature gate
  const { plan: ownerPlan, subscriptionStatus: ownerSubStatus } = await getTeamOwnerPlan(teamId)
  if (checkSubscriptionNotLocked(ownerSubStatus)) throw new MemberSubscriptionLockedError()
  if (checkFeatureAccess(ownerPlan, 'teams')) throw new MemberFeatureDeniedError()

  const userToAdd = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  })
  if (!userToAdd) throw new MemberUserNotFoundError()

  const existingMembership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: userToAdd.id } },
  })
  if (existingMembership) throw new MemberAlreadyExistsError()

  if (role === 'OWNER' && membership.role !== 'OWNER') {
    throw new MemberOnlyOwnerCanAddOwnerError()
  }

  const newMember = await prisma.teamMember.create({
    data: { teamId, userId: userToAdd.id, role: role || 'MEMBER' },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  })

  logTeamAction({
    teamId,
    userId: sessionUserId,
    action: 'member.added',
    targetType: 'TeamMember',
    targetId: newMember.id,
    changes: { email: userToAdd.email, role: role || 'MEMBER' },
  }).catch(() => {})

  // Send notification and email (fire-and-forget)
  try {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { name: true, slug: true },
    })
    if (team) {
      const actorName = sessionUserName || sessionUserEmail || 'Someone'
      const roleName = (role || 'MEMBER').charAt(0) + (role || 'MEMBER').slice(1).toLowerCase()

      const notif = buildTeamNotification('TEAM_MEMBER_ADDED', {
        teamName: team.name,
        actorName,
        role: roleName,
      })
      await createNotification({
        userId: userToAdd.id,
        type: 'TEAM_MEMBER_ADDED',
        title: notif.title,
        message: notif.message,
      })

      await queueTeamMemberAddedEmail(userToAdd.email!, {
        memberName: userToAdd.name || 'there',
        teamName: team.name,
        actorName,
        role: roleName,
        teamUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/teams/${teamId}`,
      })
    }
  } catch (err) {
    console.error('Failed to send team member notification:', err)
  }

  return newMember
}

// ── Get member details ────────────────────────────────────────────────────────

export async function getTeamMember(teamId: string, memberId: string, sessionUserId: string) {
  const currentMembership = await checkTeamAccess(teamId, sessionUserId)
  if (!currentMembership) throw new MemberNotAuthorizedError('Not a member of this team')

  const member = await prisma.teamMember.findUnique({
    where: { id: memberId },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      assignments: {
        include: {
          eventType: { select: { id: true, title: true } },
        },
      },
    },
  })

  if (!member || member.teamId !== teamId) throw new MemberNotFoundError()
  return member
}

// ── Update member ─────────────────────────────────────────────────────────────

export interface UpdateTeamMemberInput {
  teamId: string
  memberId: string
  sessionUserId: string
  role?: TeamMemberRole
  isActive?: boolean
  priority?: number
}

export async function updateTeamMember(input: UpdateTeamMemberInput) {
  const { teamId, memberId, sessionUserId, role, isActive, priority } = input

  const currentMembership = await checkTeamAccess(teamId, sessionUserId)
  if (!currentMembership || currentMembership.role === 'MEMBER') {
    throw new MemberNotAuthorizedError('Not authorized to update members')
  }

  const targetMember = await prisma.teamMember.findUnique({ where: { id: memberId } })
  if (!targetMember || targetMember.teamId !== teamId) throw new MemberNotFoundError()

  if (role) {
    if (
      (role === 'OWNER' || targetMember.role === 'OWNER') &&
      currentMembership.role !== 'OWNER'
    ) {
      throw new MemberOwnerModifyError()
    }

    if (targetMember.role === 'OWNER' && role !== 'OWNER') {
      const ownerCount = await prisma.teamMember.count({
        where: { teamId, role: 'OWNER' },
      })
      if (ownerCount <= 1) {
        throw new MemberLastOwnerError('Cannot demote the last owner. Promote another member first.')
      }
    }
  }

  const updatedMember = await prisma.teamMember.update({
    where: { id: memberId },
    data: {
      ...(role !== undefined && { role }),
      ...(isActive !== undefined && { isActive }),
      ...(priority !== undefined && { priority }),
    },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  })

  const action =
    role !== undefined
      ? 'member.role_changed'
      : isActive !== undefined
        ? 'member.status_changed'
        : 'member.updated'

  logTeamAction({
    teamId,
    userId: sessionUserId,
    action,
    targetType: 'TeamMember',
    targetId: memberId,
    changes: {
      ...(role !== undefined && { role: { from: targetMember.role, to: role } }),
      ...(isActive !== undefined && { isActive: { from: targetMember.isActive, to: isActive } }),
      ...(priority !== undefined && { priority: { from: targetMember.priority, to: priority } }),
    },
  }).catch(() => {})

  return updatedMember
}

// ── Remove member ─────────────────────────────────────────────────────────────

export async function removeTeamMember(
  teamId: string,
  memberId: string,
  sessionUserId: string
) {
  const currentMembership = await checkTeamAccess(teamId, sessionUserId)
  if (!currentMembership || currentMembership.role === 'MEMBER') {
    throw new MemberNotAuthorizedError('Not authorized to remove members')
  }

  const targetMember = await prisma.teamMember.findUnique({ where: { id: memberId } })
  if (!targetMember || targetMember.teamId !== teamId) throw new MemberNotFoundError()

  if (targetMember.role === 'OWNER' && currentMembership.role !== 'OWNER') {
    throw new MemberOwnerModifyError()
  }

  if (targetMember.role === 'OWNER') {
    const ownerCount = await prisma.teamMember.count({
      where: { teamId, role: 'OWNER' },
    })
    if (ownerCount <= 1) {
      throw new MemberLastOwnerError('Cannot remove the last owner. Transfer ownership first.')
    }
  }

  await prisma.teamMember.delete({ where: { id: memberId } })

  logTeamAction({
    teamId,
    userId: sessionUserId,
    action: 'member.removed',
    targetType: 'TeamMember',
    targetId: memberId,
    changes: { role: targetMember.role, userId: targetMember.userId },
  }).catch(() => {})
}

// ── Bulk member actions ───────────────────────────────────────────────────────

export interface BulkMemberActionInput {
  teamId: string
  sessionUserId: string
  action: 'change_role' | 'remove' | 'activate' | 'deactivate'
  memberIds: string[]
  role?: TeamMemberRole
}

export async function bulkMemberAction(input: BulkMemberActionInput) {
  const { teamId, sessionUserId, action, memberIds, role } = input

  const membership = await checkTeamAccess(teamId, sessionUserId, 'ADMIN')
  if (!membership) throw new MemberNotAuthorizedError()

  // Enforce feature gate
  const { plan: ownerPlan, subscriptionStatus: ownerSubStatus } = await getTeamOwnerPlan(teamId)
  if (checkSubscriptionNotLocked(ownerSubStatus)) throw new MemberSubscriptionLockedError()
  if (checkFeatureAccess(ownerPlan, 'teams')) throw new MemberFeatureDeniedError()

  const targetMembers = await prisma.teamMember.findMany({
    where: { id: { in: memberIds }, teamId },
  })
  if (targetMembers.length === 0) throw new MemberNoValidMembersError()

  // Safety: cannot modify owners unless current user is owner
  const hasOwnerTargets = targetMembers.some((m) => m.role === 'OWNER')
  if (hasOwnerTargets && membership.role !== 'OWNER') {
    throw new MemberOwnerModifyError()
  }

  // Safety: cannot remove all owners
  if (action === 'remove' || (action === 'change_role' && role !== 'OWNER')) {
    const ownerTargetIds = targetMembers.filter((m) => m.role === 'OWNER').map((m) => m.id)
    if (ownerTargetIds.length > 0) {
      const totalOwners = await prisma.teamMember.count({
        where: { teamId, role: 'OWNER' },
      })
      if (totalOwners - ownerTargetIds.length < 1) {
        throw new MemberLastOwnerError(
          'Cannot remove or demote all owners. At least one owner must remain.'
        )
      }
    }
  }

  const validIds = targetMembers.map((m) => m.id)
  let affected = 0

  switch (action) {
    case 'change_role': {
      if (role === 'OWNER' && membership.role !== 'OWNER') {
        throw new MemberOwnerModifyError()
      }
      const result = await prisma.teamMember.updateMany({
        where: { id: { in: validIds } },
        data: { role: role! },
      })
      affected = result.count
      logTeamAction({
        teamId,
        userId: sessionUserId,
        action: 'bulk.role_changed',
        changes: { memberIds: validIds, newRole: role, count: affected },
      }).catch(() => {})
      break
    }
    case 'remove': {
      const result = await prisma.teamMember.deleteMany({
        where: { id: { in: validIds } },
      })
      affected = result.count
      logTeamAction({
        teamId,
        userId: sessionUserId,
        action: 'bulk.removed',
        changes: { memberIds: validIds, count: affected },
      }).catch(() => {})
      break
    }
    case 'activate': {
      const result = await prisma.teamMember.updateMany({
        where: { id: { in: validIds } },
        data: { isActive: true },
      })
      affected = result.count
      logTeamAction({
        teamId,
        userId: sessionUserId,
        action: 'bulk.activated',
        changes: { memberIds: validIds, count: affected },
      }).catch(() => {})
      break
    }
    case 'deactivate': {
      const result = await prisma.teamMember.updateMany({
        where: { id: { in: validIds } },
        data: { isActive: false },
      })
      affected = result.count
      logTeamAction({
        teamId,
        userId: sessionUserId,
        action: 'bulk.deactivated',
        changes: { memberIds: validIds, count: affected },
      }).catch(() => {})
      break
    }
  }

  return { affected }
}

// ── Member integrations ───────────────────────────────────────────────────────

export async function listMemberIntegrations(teamId: string, sessionUserId: string) {
  const membership = await checkTeamAccess(teamId, sessionUserId)
  if (!membership) throw new MemberNotAuthorizedError('Not a member of this team')

  const members = await prisma.teamMember.findMany({
    where: { teamId, isActive: true },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          calendars: {
            where: { isEnabled: true },
            select: { id: true, provider: true, name: true },
          },
          zoomCredential: { select: { id: true } },
        },
      },
    },
    orderBy: [{ role: 'asc' }, { priority: 'asc' }, { createdAt: 'asc' }],
  })

  return members.map((member) => ({
    memberId: member.id,
    userId: member.user.id,
    name: member.user.name,
    email: member.user.email,
    image: member.user.image,
    integrations: {
      googleCalendar: member.user.calendars.some((c) => c.provider === 'GOOGLE'),
      outlookCalendar: member.user.calendars.some((c) => c.provider === 'OUTLOOK'),
      zoom: !!member.user.zoomCredential,
    },
  }))
}
