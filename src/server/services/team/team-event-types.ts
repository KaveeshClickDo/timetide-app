/**
 * Team event type management: list, create, get, update, delete,
 * and member assignment operations.
 *
 * Handles: feature gating, slug uniqueness, transactions for
 * questions/assignments, and member verification.
 */

import prisma from '@/server/db/prisma'
import { checkTeamAccess } from '@/server/teams/team-access'
import {
  checkFeatureAccess,
  checkEventTypeFeatures,
  getTeamOwnerPlan,
  checkSubscriptionNotLocked,
} from '@/server/billing/plan-enforcement'
import type { QuestionType } from '@/generated/prisma/client'

// ── Domain errors ─────────────────────────────────────────────────────────────

export class TeamEventTypeNotFoundError extends Error {
  constructor() {
    super('Event type not found')
    this.name = 'TeamEventTypeNotFoundError'
  }
}

export class TeamEventTypeNotAuthorizedError extends Error {
  constructor(message = 'Not authorized') {
    super(message)
    this.name = 'TeamEventTypeNotAuthorizedError'
  }
}

export class TeamEventTypeFeatureDeniedError extends Error {
  constructor(message = 'Feature not available on current plan') {
    super(message)
    this.name = 'TeamEventTypeFeatureDeniedError'
  }
}

export class TeamEventTypeSubscriptionLockedError extends Error {
  constructor() {
    super('Subscription is locked')
    this.name = 'TeamEventTypeSubscriptionLockedError'
  }
}

export class TeamEventTypeSlugTakenError extends Error {
  constructor() {
    super('An event type with this slug already exists in this team')
    this.name = 'TeamEventTypeSlugTakenError'
  }
}

export class TeamEventTypeAssignmentExistsError extends Error {
  constructor() {
    super('Member is already assigned to this event type')
    this.name = 'TeamEventTypeAssignmentExistsError'
  }
}

export class TeamEventTypeAssignmentNotFoundError extends Error {
  constructor() {
    super('Assignment not found')
    this.name = 'TeamEventTypeAssignmentNotFoundError'
  }
}

export class TeamEventTypeMemberNotFoundError extends Error {
  constructor() {
    super('Member not found in this team')
    this.name = 'TeamEventTypeMemberNotFoundError'
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Standard include for event type with assignments */
const eventTypeWithAssignmentsInclude = {
  questions: { orderBy: { order: 'asc' as const } },
  teamMemberAssignments: {
    include: {
      teamMember: {
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      },
    },
  },
}

async function enforceTeamFeatureGate(teamId: string) {
  const { plan: ownerPlan, subscriptionStatus: ownerSubStatus } = await getTeamOwnerPlan(teamId)
  if (checkSubscriptionNotLocked(ownerSubStatus)) throw new TeamEventTypeSubscriptionLockedError()
  if (checkFeatureAccess(ownerPlan, 'teams')) throw new TeamEventTypeFeatureDeniedError()
  return ownerPlan
}

// ── List team event types ─────────────────────────────────────────────────────

export async function listTeamEventTypes(teamId: string, sessionUserId: string) {
  const membership = await checkTeamAccess(teamId, sessionUserId)
  if (!membership) throw new TeamEventTypeNotAuthorizedError('Not a member of this team')

  return prisma.eventType.findMany({
    where: { teamId },
    include: {
      ...eventTypeWithAssignmentsInclude,
      _count: { select: { bookings: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

// ── Get team event type ───────────────────────────────────────────────────────

export async function getTeamEventType(
  teamId: string,
  eventTypeId: string,
  sessionUserId: string
) {
  const membership = await checkTeamAccess(teamId, sessionUserId)
  if (!membership) throw new TeamEventTypeNotAuthorizedError('Not a member of this team')

  const eventType = await prisma.eventType.findFirst({
    where: { id: eventTypeId, teamId },
    include: {
      ...eventTypeWithAssignmentsInclude,
      _count: { select: { bookings: true } },
    },
  })

  if (!eventType) throw new TeamEventTypeNotFoundError()
  return eventType
}

// ── Create team event type ────────────────────────────────────────────────────

export interface CreateTeamEventTypeInput {
  teamId: string
  sessionUserId: string
  data: Record<string, unknown>
  questions?: Array<{
    type: QuestionType
    label: string
    required?: boolean
    placeholder?: string
    options?: string[]
  }>
  memberIds?: string[]
  meetingOrganizerUserId?: string
}

export async function createTeamEventType(input: CreateTeamEventTypeInput) {
  const { teamId, sessionUserId, data, questions, memberIds, meetingOrganizerUserId } = input

  const membership = await checkTeamAccess(teamId, sessionUserId)
  if (!membership || membership.role === 'MEMBER') {
    throw new TeamEventTypeNotAuthorizedError('Not authorized to create team event types')
  }

  const ownerPlan = await enforceTeamFeatureGate(teamId)

  // Enforce pro feature gates on event type fields
  const eventFeatureDenied = checkEventTypeFeatures(ownerPlan, data)
  if (eventFeatureDenied) throw new TeamEventTypeFeatureDeniedError()

  const slug = data.slug as string

  // Check slug uniqueness within team
  const existingSlug = await prisma.eventType.findFirst({
    where: { teamId, slug },
  })
  if (existingSlug) throw new TeamEventTypeSlugTakenError()

  // Build event type data (exclude questions, memberIds, meetingOrganizerUserId)
  const { slug: _s, questions: _q, memberIds: _m, meetingOrganizerUserId: _mo, ...eventTypeData } = data

  const eventType = await prisma.$transaction(async (tx) => {
    const created = await tx.eventType.create({
      data: {
        ...(eventTypeData as any),
        slug,
        userId: sessionUserId,
        teamId,
        meetingOrganizerUserId: meetingOrganizerUserId || undefined,
        periodStartDate: eventTypeData.periodStartDate
          ? new Date(eventTypeData.periodStartDate as string)
          : undefined,
        periodEndDate: eventTypeData.periodEndDate
          ? new Date(eventTypeData.periodEndDate as string)
          : undefined,
        questions: questions?.length
          ? {
              create: questions.map((q, index) => ({
                ...q,
                order: index,
                options: q.options ? q.options : undefined,
              })),
            }
          : undefined,
      },
      include: { questions: true },
    })

    if (memberIds && memberIds.length > 0) {
      const validMembers = await tx.teamMember.findMany({
        where: { id: { in: memberIds }, teamId },
      })
      if (validMembers.length > 0) {
        await tx.eventTypeAssignment.createMany({
          data: validMembers.map((member) => ({
            eventTypeId: created.id,
            teamMemberId: member.id,
          })),
        })
      }
    }

    return tx.eventType.findUnique({
      where: { id: created.id },
      include: eventTypeWithAssignmentsInclude,
    })
  })

  return eventType
}

// ── Update team event type ────────────────────────────────────────────────────

export interface UpdateTeamEventTypeInput {
  teamId: string
  eventTypeId: string
  sessionUserId: string
  data: Record<string, unknown>
  questions?: Array<{
    type: string
    label: string
    required?: boolean
    placeholder?: string
    options?: string[]
  }>
  memberIds?: string[]
  meetingOrganizerUserId?: string | null
}

export async function updateTeamEventType(input: UpdateTeamEventTypeInput) {
  const { teamId, eventTypeId, sessionUserId, data, questions, memberIds, meetingOrganizerUserId } =
    input

  const membership = await checkTeamAccess(teamId, sessionUserId)
  if (!membership || membership.role === 'MEMBER') {
    throw new TeamEventTypeNotAuthorizedError('Not authorized to update team event types')
  }

  const ownerPlan = await enforceTeamFeatureGate(teamId)

  const existing = await prisma.eventType.findFirst({
    where: { id: eventTypeId, teamId },
  })
  if (!existing) throw new TeamEventTypeNotFoundError()

  // Enforce pro feature gates
  const eventFeatureDenied = checkEventTypeFeatures(ownerPlan, data)
  if (eventFeatureDenied) throw new TeamEventTypeFeatureDeniedError()

  // Check slug uniqueness if changing
  if (data.slug && data.slug !== existing.slug) {
    const existingSlug = await prisma.eventType.findFirst({
      where: { teamId, slug: data.slug as string, NOT: { id: eventTypeId } },
    })
    if (existingSlug) throw new TeamEventTypeSlugTakenError()
  }

  // Build update data from allowed fields
  const updateData: Record<string, unknown> = {}
  const allowedFields = [
    'title', 'slug', 'description', 'length', 'locationType', 'locationValue',
    'isActive', 'requiresConfirmation', 'schedulingType',
    'minimumNotice', 'bufferTimeBefore', 'bufferTimeAfter', 'maxBookingsPerDay',
    'periodType', 'periodDays', 'periodStartDate', 'periodEndDate',
    'seatsPerSlot', 'hideNotes', 'slotInterval', 'successRedirectUrl',
    'allowsRecurring', 'recurringMaxWeeks', 'recurringFrequency', 'recurringInterval',
  ] as const

  for (const field of allowedFields) {
    if ((data as any)[field] !== undefined) {
      updateData[field] = (data as any)[field]
    }
  }

  if (meetingOrganizerUserId !== undefined) {
    updateData.meetingOrganizerUserId = meetingOrganizerUserId
  }

  // Convert date strings
  if (updateData.periodStartDate && typeof updateData.periodStartDate === 'string') {
    updateData.periodStartDate = new Date(updateData.periodStartDate as string)
  }
  if (updateData.periodEndDate && typeof updateData.periodEndDate === 'string') {
    updateData.periodEndDate = new Date(updateData.periodEndDate as string)
  }

  const eventType = await prisma.$transaction(async (tx) => {
    await tx.eventType.update({
      where: { id: eventTypeId },
      data: updateData,
    })

    if (questions !== undefined) {
      await tx.eventTypeQuestion.deleteMany({ where: { eventTypeId } })
      if (questions.length > 0) {
        await tx.eventTypeQuestion.createMany({
          data: questions.map((q, index) => ({
            eventTypeId,
            type: q.type as QuestionType,
            label: q.label,
            required: q.required ?? false,
            placeholder: q.placeholder,
            options: q.options || undefined,
            order: index,
          })),
        })
      }
    }

    if (memberIds !== undefined) {
      await tx.eventTypeAssignment.deleteMany({ where: { eventTypeId } })
      if (memberIds.length > 0) {
        const validMembers = await tx.teamMember.findMany({
          where: { id: { in: memberIds }, teamId },
        })
        if (validMembers.length > 0) {
          await tx.eventTypeAssignment.createMany({
            data: validMembers.map((member) => ({
              eventTypeId,
              teamMemberId: member.id,
            })),
          })
        }
      }
    }

    return tx.eventType.findUnique({
      where: { id: eventTypeId },
      include: eventTypeWithAssignmentsInclude,
    })
  })

  return eventType
}

// ── Delete team event type ────────────────────────────────────────────────────

export async function deleteTeamEventType(
  teamId: string,
  eventTypeId: string,
  sessionUserId: string
) {
  const membership = await checkTeamAccess(teamId, sessionUserId)
  if (!membership || membership.role === 'MEMBER') {
    throw new TeamEventTypeNotAuthorizedError('Not authorized to delete team event types')
  }

  const existing = await prisma.eventType.findFirst({
    where: { id: eventTypeId, teamId },
  })
  if (!existing) throw new TeamEventTypeNotFoundError()

  await prisma.eventTypeQuestion.deleteMany({ where: { eventTypeId } })
  await prisma.eventTypeAssignment.deleteMany({ where: { eventTypeId } })
  await prisma.eventType.delete({ where: { id: eventTypeId } })
}

// ── List assignments ──────────────────────────────────────────────────────────

export async function listEventTypeAssignments(
  teamId: string,
  eventTypeId: string,
  sessionUserId: string
) {
  const membership = await checkTeamAccess(teamId, sessionUserId)
  if (!membership) throw new TeamEventTypeNotAuthorizedError('Not a member of this team')

  const eventType = await prisma.eventType.findFirst({
    where: { id: eventTypeId, teamId },
  })
  if (!eventType) throw new TeamEventTypeNotFoundError()

  return prisma.eventTypeAssignment.findMany({
    where: { eventTypeId },
    include: {
      teamMember: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      },
    },
  })
}

// ── Assign member ─────────────────────────────────────────────────────────────

export interface AssignMemberInput {
  teamId: string
  eventTypeId: string
  sessionUserId: string
  memberId: string
}

export async function assignMemberToEventType(input: AssignMemberInput) {
  const { teamId, eventTypeId, sessionUserId, memberId } = input

  const membership = await checkTeamAccess(teamId, sessionUserId)
  if (!membership || membership.role === 'MEMBER') {
    throw new TeamEventTypeNotAuthorizedError('Not authorized to manage assignments')
  }

  await enforceTeamFeatureGate(teamId)

  const eventType = await prisma.eventType.findFirst({
    where: { id: eventTypeId, teamId },
  })
  if (!eventType) throw new TeamEventTypeNotFoundError()

  const teamMember = await prisma.teamMember.findFirst({
    where: { id: memberId, teamId },
  })
  if (!teamMember) throw new TeamEventTypeMemberNotFoundError()

  const existingAssignment = await prisma.eventTypeAssignment.findUnique({
    where: { eventTypeId_teamMemberId: { eventTypeId, teamMemberId: memberId } },
  })
  if (existingAssignment) throw new TeamEventTypeAssignmentExistsError()

  return prisma.eventTypeAssignment.create({
    data: { eventTypeId, teamMemberId: memberId },
    include: {
      teamMember: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      },
    },
  })
}

// ── Remove assignment ─────────────────────────────────────────────────────────

export async function removeEventTypeAssignment(
  teamId: string,
  eventTypeId: string,
  sessionUserId: string,
  memberId: string
) {
  const membership = await checkTeamAccess(teamId, sessionUserId)
  if (!membership || membership.role === 'MEMBER') {
    throw new TeamEventTypeNotAuthorizedError('Not authorized to manage assignments')
  }

  const eventType = await prisma.eventType.findFirst({
    where: { id: eventTypeId, teamId },
  })
  if (!eventType) throw new TeamEventTypeNotFoundError()

  const assignment = await prisma.eventTypeAssignment.findUnique({
    where: { eventTypeId_teamMemberId: { eventTypeId, teamMemberId: memberId } },
  })
  if (!assignment) throw new TeamEventTypeAssignmentNotFoundError()

  await prisma.eventTypeAssignment.delete({ where: { id: assignment.id } })
}
