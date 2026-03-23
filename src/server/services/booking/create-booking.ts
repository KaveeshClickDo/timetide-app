/**
 * Create a new booking (single or recurring).
 *
 * Orchestrates: email verification, event type lookup, team member selection,
 * slot validation, serializable transaction with retry, calendar events,
 * and post-booking notifications.
 */

import { addMinutes, addDays, parseISO } from 'date-fns'
import { nanoid } from 'nanoid'
import prisma from '@/server/db/prisma'
import { Prisma } from '@/generated/prisma/client'
import { isSlotAvailable } from '@/server/scheduling/slots/calculator'
import { verifyCode } from '@/server/auth/email-verification'
import { PLAN_LIMITS, type PlanTier } from '@/lib/pricing'
import {
  generateRecurringDates,
  type RecurringFrequency,
} from '@/lib/scheduling/recurring/utils'
import {
  selectTeamMember,
  TeamSelectionError,
  type HostInfo,
} from './select-team-member'
import { validateSlotAvailability } from './validate-slot'
import { validateRecurringSlots } from './validate-recurring'
import { createCalendarEvents } from './create-calendar-events'
import { sendBookingNotifications } from './send-notifications'

// ── Domain errors ─────────────────────────────────────────────────────────────

export class EmailVerificationRequiredError extends Error {
  constructor(message = 'Email verification is required to create a booking') {
    super(message)
    this.name = 'EmailVerificationRequiredError'
  }
}

export class EmailVerificationFailedError extends Error {
  constructor(message = 'Email verification failed') {
    super(message)
    this.name = 'EmailVerificationFailedError'
  }
}

export class EventTypeNotFoundError extends Error {
  constructor(message = 'Event type not found or is not active') {
    super(message)
    this.name = 'EventTypeNotFoundError'
  }
}

export class RecurringNotAllowedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RecurringNotAllowedError'
  }
}

export class RecurringWindowError extends Error {
  constructor() {
    super('The last occurrence falls outside the booking window. Please reduce the number of sessions.')
    this.name = 'RecurringWindowError'
  }
}

export class SeatsFullError extends Error {
  constructor() {
    super('All seats for this time slot are taken. Please select another time.')
    this.name = 'SeatsFullError'
  }
}

export class MemberConflictError extends Error {
  constructor() {
    super('This time slot was just booked. Please select another time.')
    this.name = 'MemberConflictError'
  }
}

export class SerializationConflictError extends Error {
  constructor() {
    super('This time slot was just booked by someone else. Please select another time.')
    this.name = 'SerializationConflictError'
  }
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateBookingInput {
  eventTypeId: string
  startTime: string
  timezone: string
  name: string
  email: string
  phone?: string | null
  notes?: string | null
  responses?: Record<string, unknown> | null
  recurring?: {
    weeks: number
    frequency?: RecurringFrequency
    interval?: number
  } | null
  emailVerification: {
    code: string
    signature: string
    expiresAt: number
  }
}

export interface CreateBookingResult {
  booking: {
    uid: string
    status: string
    startTime: Date
    endTime: Date
    meetingUrl: string | null
  }
  isRecurring: boolean
  recurringBookings?: Array<{
    uid: string
    startTime: Date
    endTime: Date
  }>
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  const {
    eventTypeId,
    startTime,
    timezone,
    name,
    email,
    phone,
    notes,
    responses,
    recurring,
    emailVerification: ev,
  } = input

  // ── Verify email ownership via HMAC code ──────────────────────────────────
  if (!ev?.code || !ev?.signature || !ev?.expiresAt) {
    throw new EmailVerificationRequiredError()
  }
  const verification = verifyCode(email, ev.code, 'BOOKING_CREATE', ev.signature, ev.expiresAt)
  if (!verification.valid) {
    throw new EmailVerificationFailedError(verification.error || 'Email verification failed')
  }

  // ── Fetch event type with team member assignments ─────────────────────────
  const eventType = await prisma.eventType.findUnique({
    where: { id: eventTypeId, isActive: true, lockedByDowngrade: false },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          timezone: true,
        },
      },
      schedule: true,
      team: {
        select: {
          id: true,
          name: true,
        },
      },
      teamMemberAssignments: {
        where: { isActive: true },
        include: {
          teamMember: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  username: true,
                  timezone: true,
                },
              },
            },
          },
        },
        orderBy: {
          teamMember: {
            priority: 'asc',
          },
        },
      },
    },
  })

  if (!eventType) {
    throw new EventTypeNotFoundError()
  }

  // ── For team event types, verify team owner still has TEAM plan ────────────
  if (eventType.teamId) {
    const teamOwner = await prisma.teamMember.findFirst({
      where: { teamId: eventType.teamId, role: 'OWNER' },
      select: { user: { select: { plan: true } } },
    })
    const ownerPlan = (teamOwner?.user?.plan || 'FREE') as PlanTier
    if (!PLAN_LIMITS[ownerPlan]?.teams) {
      throw new EventTypeNotFoundError('This team event type is currently unavailable')
    }
  }

  // ── Validate recurring request ────────────────────────────────────────────
  if (recurring && !eventType.allowsRecurring) {
    throw new RecurringNotAllowedError('This event type does not allow recurring bookings')
  }

  if (recurring && eventType.recurringMaxWeeks && recurring.weeks > eventType.recurringMaxWeeks) {
    throw new RecurringNotAllowedError(
      `This event type allows a maximum of ${eventType.recurringMaxWeeks} sessions`
    )
  }

  // ── Compute recurring dates and validate booking window ───────────────────
  const recurringFrequency = (recurring?.frequency || eventType.recurringFrequency || 'weekly') as RecurringFrequency
  const recurringInterval = recurring?.interval || eventType.recurringInterval || undefined

  if (recurring && recurring.weeks > 1) {
    const recurringDates = generateRecurringDates(parseISO(startTime), {
      frequency: recurringFrequency,
      count: recurring.weeks,
      interval: recurringInterval,
    })
    const lastOccurrence = recurringDates[recurringDates.length - 1]
    let windowEnd: Date | null = null

    if (eventType.periodType === 'ROLLING' && eventType.periodDays) {
      windowEnd = addDays(new Date(), eventType.periodDays)
    } else if (eventType.periodType === 'RANGE' && eventType.periodEndDate) {
      windowEnd = new Date(eventType.periodEndDate)
    }

    if (windowEnd && lastOccurrence > windowEnd) {
      throw new RecurringWindowError()
    }
  }

  const startDate = parseISO(startTime)
  const endDate = addMinutes(startDate, eventType.length)

  // ── Team member selection ─────────────────────────────────────────────────
  const eventOwner: HostInfo = {
    id: eventType.userId,
    name: eventType.user.name,
    email: eventType.user.email,
    username: eventType.user.username,
    timezone: eventType.user.timezone,
  }

  let selectedHost = eventOwner
  let assignedUserId: string | undefined
  let shouldUpdateRoundRobinState = false

  if (eventType.teamId && eventType.schedulingType && eventType.teamMemberAssignments.length > 0) {
    const result = await selectTeamMember({
      schedulingType: eventType.schedulingType as 'ROUND_ROBIN' | 'COLLECTIVE' | 'MANAGED',
      teamMemberAssignments: eventType.teamMemberAssignments,
      lastAssignedMemberId: eventType.lastAssignedMemberId,
      meetingOrganizerUserId: eventType.meetingOrganizerUserId,
      eventOwner,
      startDate,
      endDate,
      bufferTimeBefore: eventType.bufferTimeBefore,
      bufferTimeAfter: eventType.bufferTimeAfter,
    })

    selectedHost = result.selectedHost
    assignedUserId = result.assignedUserId
    shouldUpdateRoundRobinState = result.shouldUpdateRoundRobinState
  }

  // ── Slot availability validation ──────────────────────────────────────────
  await validateSlotAvailability({
    hostId: selectedHost.id,
    eventTypeId,
    startDate,
    endDate,
    bufferTimeBefore: eventType.bufferTimeBefore,
    bufferTimeAfter: eventType.bufferTimeAfter,
    minimumNotice: eventType.minimumNotice,
    maxBookingsPerDay: eventType.maxBookingsPerDay,
    seatsPerSlot: eventType.seatsPerSlot ?? 1,
  })

  // ── Recurring slot validation ─────────────────────────────────────────────
  const occurrenceCount = recurring ? recurring.weeks : 1
  const recurringGroupId = recurring ? nanoid() : undefined

  const allOccurrenceDates =
    recurring && occurrenceCount > 1
      ? generateRecurringDates(startDate, {
          frequency: recurringFrequency,
          count: occurrenceCount,
          interval: recurringInterval,
        })
      : [startDate]

  if (recurring && occurrenceCount > 1) {
    await validateRecurringSlots({
      hostId: selectedHost.id,
      eventTypeId,
      allOccurrenceDates,
      eventLength: eventType.length,
      timezone,
      bufferTimeBefore: eventType.bufferTimeBefore,
      bufferTimeAfter: eventType.bufferTimeAfter,
      maxBookingsPerDay: eventType.maxBookingsPerDay,
      seatsPerSlot: eventType.seatsPerSlot ?? 1,
    })
  }

  // ── Determine location ────────────────────────────────────────────────────
  let location: string | undefined

  switch (eventType.locationType) {
    case 'GOOGLE_MEET':
      location = 'Google Meet'
      break
    case 'TEAMS':
      location = 'Microsoft Teams'
      break
    case 'ZOOM':
      location = 'Zoom'
      break
    case 'IN_PERSON':
      location = eventType.locationValue ?? 'In Person'
      break
    case 'PHONE':
      location = `Phone: ${phone ?? 'TBD'}`
      break
    case 'CUSTOM':
      location = eventType.locationValue ?? undefined
      break
  }

  // ── Create bookings (serializable transaction with retry) ─────────────────
  const isManagedUnassigned = eventType.schedulingType === 'MANAGED' && !assignedUserId
  const bookingStatus = eventType.requiresConfirmation || isManagedUnassigned ? 'PENDING' : 'CONFIRMED'
  const isGroupEvent = (eventType.seatsPerSlot ?? 1) > 1
  const seatsPerSlot = eventType.seatsPerSlot ?? 1

  const createdBookings: Array<{
    id: string
    uid: string
    status: string
    startTime: Date
    endTime: Date
    meetingUrl: string | null
  }> = []

  const MAX_SERIALIZATION_RETRIES = 3
  const conflictedMemberIds = new Set<string>()

  for (let attempt = 0; attempt < MAX_SERIALIZATION_RETRIES; attempt++) {
    try {
      const txResult = await prisma.$transaction(
        async (tx) => {
          const txBookings: typeof createdBookings = []

          for (let i = 0; i < occurrenceCount; i++) {
            const occStart = allOccurrenceDates[i]
            const occEnd = addMinutes(occStart, eventType.length)

            // Re-check seat availability inside Serializable transaction
            if (isGroupEvent) {
              const currentCount = await tx.booking.count({
                where: {
                  eventTypeId,
                  startTime: occStart,
                  status: { in: ['PENDING', 'CONFIRMED'] },
                },
              })
              if (currentCount >= seatsPerSlot) {
                throw new Error('SEATS_FULL')
              }
            }

            // Guard against round-robin race condition
            if (assignedUserId) {
              const memberConflict = await tx.booking.findFirst({
                where: {
                  OR: [
                    { hostId: assignedUserId },
                    { assignedUserId: assignedUserId },
                    { attendees: { some: { userId: assignedUserId } } },
                  ],
                  status: { in: ['PENDING', 'CONFIRMED'] },
                  startTime: { lt: occEnd },
                  endTime: { gt: occStart },
                },
              })
              if (memberConflict) {
                throw new Error('MEMBER_CONFLICT')
              }
            }

            const booking = await tx.booking.create({
              data: {
                eventTypeId,
                hostId: selectedHost.id,
                assignedUserId: assignedUserId,
                startTime: occStart,
                endTime: occEnd,
                timezone,
                inviteeName: name,
                inviteeEmail: email,
                inviteePhone: phone,
                inviteeNotes: notes,
                responses: (responses as Prisma.InputJsonValue) ?? undefined,
                status: bookingStatus,
                location,
                source: 'web',
                recurringGroupId,
                recurringIndex: recurring ? i : undefined,
                recurringCount: recurring ? occurrenceCount : undefined,
                recurringFrequency: recurring ? recurringFrequency : undefined,
                recurringInterval: recurring ? recurringInterval : undefined,
              },
            })

            txBookings.push({
              id: booking.id,
              uid: booking.uid,
              status: booking.status,
              startTime: booking.startTime,
              endTime: booking.endTime,
              meetingUrl: null,
            })
          }

          // Create BookingAttendee records for collective team members (non-host)
          if (eventType.schedulingType === 'COLLECTIVE' && eventType.teamMemberAssignments.length > 0) {
            const nonHostMembers = eventType.teamMemberAssignments.filter(
              (a) => a.teamMember.user.id !== selectedHost.id
            )
            for (const booking of txBookings) {
              await tx.bookingAttendee.createMany({
                data: nonHostMembers.map((a) => ({
                  bookingId: booking.id,
                  email: a.teamMember.user.email!,
                  name: a.teamMember.user.name ?? undefined,
                  userId: a.teamMember.user.id,
                })),
              })
            }
          }

          // Update round-robin state with optimistic locking
          if (shouldUpdateRoundRobinState && assignedUserId && eventType.teamId) {
            const assignedMemberRecord = eventType.teamMemberAssignments.find(
              (a) => a.teamMember.user.id === assignedUserId
            )
            if (assignedMemberRecord) {
              const expectedLastMemberId = eventType.lastAssignedMemberId
              const updated = await tx.eventType.updateMany({
                where: {
                  id: eventTypeId,
                  lastAssignedMemberId: expectedLastMemberId ?? null,
                },
                data: { lastAssignedMemberId: assignedMemberRecord.teamMember.id },
              })
              if (updated.count === 0) {
                throw new Error('ROUND_ROBIN_CONFLICT')
              }
            }
          }

          return txBookings
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )

      // Transaction succeeded
      createdBookings.push(...txResult)
      break
    } catch (txError) {
      const isSerializationFailure =
        txError instanceof Error &&
        'code' in txError &&
        (txError as { code: string }).code === 'P2034'
      const isRoundRobinConflict =
        txError instanceof Error &&
        (txError.message === 'MEMBER_CONFLICT' || txError.message === 'ROUND_ROBIN_CONFLICT')

      if ((isSerializationFailure || isRoundRobinConflict) && attempt < MAX_SERIALIZATION_RETRIES - 1) {
        // On round-robin conflicts, re-select the next available member
        if (isRoundRobinConflict && shouldUpdateRoundRobinState && eventType.schedulingType === 'ROUND_ROBIN') {
          if (assignedUserId) {
            conflictedMemberIds.add(assignedUserId)
          }

          // Re-read current round-robin state from DB
          const freshEventType = await prisma.eventType.findUnique({
            where: { id: eventTypeId },
            select: { lastAssignedMemberId: true },
          })
          if (freshEventType) {
            eventType.lastAssignedMemberId = freshEventType.lastAssignedMemberId
          }

          // Re-run member selection, skipping conflicted members
          const assignedMembers = eventType.teamMemberAssignments.map((a) => a.teamMember)
          const freshLastIndex = eventType.lastAssignedMemberId
            ? assignedMembers.findIndex((m) => m.id === eventType.lastAssignedMemberId)
            : -1

          let newMemberIndex = freshLastIndex
          let foundMember = false

          for (let j = 0; j < assignedMembers.length; j++) {
            newMemberIndex = (newMemberIndex + 1) % assignedMembers.length
            const candidate = assignedMembers[newMemberIndex]

            if (conflictedMemberIds.has(candidate.user.id)) continue

            const candidateBookings = await prisma.booking.findMany({
              where: {
                OR: [
                  { hostId: candidate.user.id },
                  { assignedUserId: candidate.user.id },
                  { attendees: { some: { userId: candidate.user.id } } },
                ],
                status: { in: ['PENDING', 'CONFIRMED'] },
                startTime: { lt: endDate },
                endTime: { gt: startDate },
              },
            })

            const candidateBusy = candidateBookings.map((b) => ({ start: b.startTime, end: b.endTime }))
            const candidateAvailable = isSlotAvailable(
              { start: startDate, end: endDate },
              candidateBusy,
              eventType.bufferTimeBefore,
              eventType.bufferTimeAfter
            )

            if (candidateAvailable) {
              selectedHost = {
                id: candidate.user.id,
                name: candidate.user.name,
                email: candidate.user.email,
                username: candidate.user.username,
                timezone: candidate.user.timezone,
              }
              assignedUserId = candidate.user.id
              foundMember = true
              break
            } else {
              conflictedMemberIds.add(candidate.user.id)
            }
          }

          if (!foundMember) {
            throw new MemberConflictError()
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)))
        continue
      }

      // Map internal error messages to domain errors
      if (txError instanceof Error && txError.message === 'SEATS_FULL') {
        throw new SeatsFullError()
      }
      if (txError instanceof Error && (txError.message === 'MEMBER_CONFLICT' || txError.message === 'ROUND_ROBIN_CONFLICT')) {
        throw new MemberConflictError()
      }
      if (isSerializationFailure) {
        throw new SerializationConflictError()
      }

      throw txError
    }
  }

  // ── Calendar events (best-effort) ─────────────────────────────────────────
  try {
    await createCalendarEvents({
      createdBookings,
      selectedHost,
      meetingOrganizerUserId: eventType.meetingOrganizerUserId,
      eventTitle: eventType.title,
      eventLength: eventType.length,
      locationType: eventType.locationType,
      bookingStatus,
      inviteeName: name,
      inviteeEmail: email,
      notes,
      location,
      isRecurring: !!recurring,
      occurrenceCount,
      schedulingType: eventType.schedulingType,
      teamMemberAssignments: eventType.teamMemberAssignments,
    })
  } catch (calendarError) {
    console.error('Calendar event creation failed (booking preserved):', calendarError)
  }

  // ── Emails, webhooks & notifications (fire-and-forget) ────────────────────
  const primaryBooking = createdBookings[0]
  const meetingUrl = primaryBooking.meetingUrl || undefined

  sendBookingNotifications({
    selectedHost,
    createdBookings,
    eventTypeId,
    eventTitle: eventType.title,
    eventSlug: eventType.slug,
    eventDescription: eventType.description,
    eventLength: eventType.length,
    requiresConfirmation: eventType.requiresConfirmation,
    inviteeName: name,
    inviteeEmail: email,
    inviteePhone: phone,
    inviteeNotes: notes,
    responses,
    timezone,
    location,
    meetingUrl,
    isRecurring: !!recurring,
    occurrenceCount,
    recurringFrequency,
    schedulingType: eventType.schedulingType,
    teamMemberAssignments: eventType.teamMemberAssignments,
  })

  // ── Return result ─────────────────────────────────────────────────────────
  return {
    booking: {
      uid: primaryBooking.uid,
      status: primaryBooking.status,
      startTime: primaryBooking.startTime,
      endTime: primaryBooking.endTime,
      meetingUrl: primaryBooking.meetingUrl,
    },
    isRecurring: !!recurring,
    recurringBookings: recurring
      ? createdBookings.map((b) => ({
          uid: b.uid,
          startTime: b.startTime,
          endTime: b.endTime,
        }))
      : undefined,
  }
}
