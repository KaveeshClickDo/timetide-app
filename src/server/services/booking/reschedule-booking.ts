/**
 * Reschedule a booking to a new time (single or this-and-future).
 *
 * Handles conflict detection with serializable transactions, calendar updates,
 * collective member calendars, emails, webhooks, reminders, notifications.
 */

import { addMinutes } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import prisma from '@/server/db/prisma'
import { Prisma } from '@/generated/prisma/client'
import { updateAllCalendarEvents } from '@/server/integrations/calendar/event-ids'
import {
  queueBookingRescheduledEmails,
  rescheduleBookingReminders,
  triggerBookingRescheduledWebhook,
} from '@/server/infrastructure/queue'
import {
  authorizeBookingAccess,
  extractTeamMembersForEmail,
  buildBookingEmailData,
  buildWebhookBookingPayload,
  sendBookingInAppNotification,
} from './booking-helpers'

// ── Domain errors ─────────────────────────────────────────────────────────────

export class RescheduleBookingNotFoundError extends Error {
  constructor() {
    super('Booking not found or cannot be rescheduled')
    this.name = 'RescheduleBookingNotFoundError'
  }
}

export class RescheduleUnauthorizedError extends Error {
  public status: number
  constructor(message = 'Unauthorized', status = 403) {
    super(message)
    this.name = 'RescheduleUnauthorizedError'
    this.status = status
  }
}

export class RescheduleTimeInPastError extends Error {
  constructor() {
    super('New time must be in the future')
    this.name = 'RescheduleTimeInPastError'
  }
}

export class RescheduleConflictError extends Error {
  public conflictDate?: Date
  constructor(message = 'This time slot conflicts with another booking', conflictDate?: Date) {
    super(message)
    this.name = 'RescheduleConflictError'
    this.conflictDate = conflictDate
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RescheduleBookingParams {
  id: string
  newStartTime: string
  reason?: string
  scope?: 'this' | 'this_and_future'
  sessionUserId?: string | null
  emailVerification?: {
    code: string
    signature: string
    expiresAt: number
  }
}

export interface RescheduleBookingResult {
  message: string
  updatedCount?: number
  booking?: {
    id: string
    uid: string
    startTime: Date
    endTime: Date
  }
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function rescheduleBooking(
  params: RescheduleBookingParams
): Promise<RescheduleBookingResult> {
  const { id, newStartTime, reason, scope, sessionUserId, emailVerification } = params
  const newStart = new Date(newStartTime)

  // Find the booking
  const booking = await prisma.booking.findFirst({
    where: {
      OR: [{ id }, { uid: id }],
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
    include: {
      eventType: {
        select: {
          id: true,
          title: true,
          slug: true,
          description: true,
          length: true,
          schedulingType: true,
          teamMemberAssignments: {
            where: { isActive: true },
            select: {
              teamMember: {
                select: {
                  userId: true,
                  user: { select: { name: true, email: true, timezone: true } },
                },
              },
            },
          },
        },
      },
      host: {
        select: {
          id: true,
          name: true,
          email: true,
          timezone: true,
        },
      },
    },
  })

  if (!booking) {
    throw new RescheduleBookingNotFoundError()
  }

  // Check authorization
  const authResult = authorizeBookingAccess({
    sessionUserId: sessionUserId ?? undefined,
    booking,
    accessId: id,
    emailVerification,
    purpose: 'reschedule',
  })

  if (!authResult.authorized) {
    throw new RescheduleUnauthorizedError(authResult.error, authResult.status)
  }

  const { isHost } = authResult

  // Validate new time is in the future
  if (newStart <= new Date()) {
    throw new RescheduleTimeInPastError()
  }

  const newEnd = addMinutes(newStart, booking.eventType.length)
  const deltaMs = newStart.getTime() - booking.startTime.getTime()

  // ── Bulk scope: reschedule this and all future occurrences ──────────────
  if (scope === 'this_and_future' && booking.recurringGroupId) {
    return rescheduleBulk({ booking, newStart, newEnd, deltaMs, reason, isHost })
  }

  // ── Single scope (default) ─────────────────────────────────────────────
  return rescheduleSingle({ booking, newStart, newEnd, reason, isHost })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getConflictUserIds(booking: {
  hostId: string
  assignedUserId: string | null
  eventType: {
    schedulingType: string | null
    teamMemberAssignments: Array<{ teamMember: { userId: string } }>
  }
}): string[] {
  if (
    booking.eventType.schedulingType === 'COLLECTIVE' &&
    booking.eventType.teamMemberAssignments.length > 0
  ) {
    return booking.eventType.teamMemberAssignments.map((a) => a.teamMember.userId)
  }
  if (booking.eventType.schedulingType === 'MANAGED' && booking.assignedUserId) {
    return [booking.assignedUserId]
  }
  return [booking.hostId]
}

async function updateCalendarEventsForBooking(
  hostId: string,
  bookingId: string,
  calendarEventId: string | null,
  calendarEventIds: unknown,
  newStart: Date,
  newEnd: Date
) {
  // Update host's calendar events
  await updateAllCalendarEvents(hostId, calendarEventId, calendarEventIds, {
    startTime: newStart,
    endTime: newEnd,
  })

  // Update collective members' calendar events
  const attendees = await prisma.bookingAttendee.findMany({
    where: { bookingId, userId: { not: null } },
  })
  for (const att of attendees) {
    if (att.userId && att.calendarEventIds) {
      updateAllCalendarEvents(att.userId, null, att.calendarEventIds, {
        startTime: newStart,
        endTime: newEnd,
      }).catch(console.error)
    }
  }
}

type RescheduleBookingData = NonNullable<
  Awaited<ReturnType<typeof prisma.booking.findFirst<{
    include: {
      eventType: {
        select: {
          id: true
          title: true
          slug: true
          description: true
          length: true
          schedulingType: true
          teamMemberAssignments: {
            where: { isActive: true }
            select: {
              teamMember: {
                select: {
                  userId: true
                  user: { select: { name: true; email: true; timezone: true } }
                }
              }
            }
          }
        }
      }
      host: {
        select: { id: true; name: true; email: true; timezone: true }
      }
    }
  }>>>
>

async function rescheduleBulk(params: {
  booking: RescheduleBookingData
  newStart: Date
  newEnd: Date
  deltaMs: number
  reason?: string
  isHost: boolean
}): Promise<RescheduleBookingResult> {
  const { booking, newStart, newEnd, deltaMs, reason, isHost } = params
  const conflictUserIds = getConflictUserIds(booking)

  const futureBookings = await prisma.booking.findMany({
    where: {
      recurringGroupId: booking.recurringGroupId,
      startTime: { gte: booking.startTime },
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
    orderBy: { startTime: 'asc' },
  })

  // Atomic bulk reschedule with serializable transaction
  const MAX_RESCHEDULE_RETRIES = 3
  let bulkConflictDate: Date | null = null
  let bulkConflictTz: string | null = null

  for (let attempt = 0; attempt < MAX_RESCHEDULE_RETRIES; attempt++) {
    try {
      await prisma.$transaction(
        async (tx) => {
          // Validate ALL shifted times for conflicts
          for (const fb of futureBookings) {
            const shiftedStart = new Date(fb.startTime.getTime() + deltaMs)
            const shiftedEnd = addMinutes(shiftedStart, booking.eventType.length)

            const conflict = await tx.booking.findFirst({
              where: {
                OR: [
                  { hostId: { in: conflictUserIds } },
                  { assignedUserId: { in: conflictUserIds } },
                ],
                id: { notIn: futureBookings.map((b) => b.id) },
                status: { in: ['PENDING', 'CONFIRMED'] },
                startTime: { lt: shiftedEnd },
                endTime: { gt: shiftedStart },
              },
            })

            if (conflict) {
              bulkConflictDate = shiftedStart
              bulkConflictTz = fb.timezone
              throw new Error('BULK_RESCHEDULE_CONFLICT')
            }
          }

          // Apply shifts
          for (const fb of futureBookings) {
            const shiftedStart = new Date(fb.startTime.getTime() + deltaMs)
            const shiftedEnd = addMinutes(shiftedStart, booking.eventType.length)

            await tx.booking.update({
              where: { id: fb.id },
              data: {
                startTime: shiftedStart,
                endTime: shiftedEnd,
                rescheduleReason: reason || null,
                lastRescheduledAt: new Date(),
              },
            })
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
      break
    } catch (txError) {
      if (txError instanceof Error && txError.message === 'BULK_RESCHEDULE_CONFLICT') {
        throw new RescheduleConflictError(
          `Conflict on ${formatInTimeZone(bulkConflictDate!, bulkConflictTz!, 'EEEE, MMMM d')}. Cannot reschedule all future occurrences.`,
          bulkConflictDate!
        )
      }
      const isSerializationFailure =
        txError instanceof Error &&
        'code' in txError &&
        (txError as { code: string }).code === 'P2034'
      if (isSerializationFailure && attempt < MAX_RESCHEDULE_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)))
        continue
      }
      throw txError
    }
  }

  // Calendar updates and reminders (outside transaction)
  for (const fb of futureBookings) {
    const shiftedStart = new Date(fb.startTime.getTime() + deltaMs)
    const shiftedEnd = addMinutes(shiftedStart, booking.eventType.length)

    await updateCalendarEventsForBooking(
      booking.hostId,
      fb.id,
      fb.calendarEventId,
      fb.calendarEventIds,
      shiftedStart,
      shiftedEnd
    )
    rescheduleBookingReminders(fb.id, fb.uid, shiftedStart).catch(console.error)
  }

  // Email
  const bulkTeamMembers = extractTeamMembersForEmail(booking.eventType)
  const emailData = buildBookingEmailData({
    booking,
    host: booking.host,
    eventType: booking.eventType,
    teamMembers: bulkTeamMembers,
    overrides: {
      startTime: `${futureBookings.length} sessions rescheduled`,
      endTime: '',
      hostStartTime: `${futureBookings.length} sessions rescheduled`,
      hostEndTime: '',
    },
  })

  queueBookingRescheduledEmails(
    emailData,
    {
      start: formatInTimeZone(booking.startTime, booking.timezone, 'EEEE, MMMM d, yyyy h:mm a'),
      end: formatInTimeZone(booking.endTime, booking.timezone, 'h:mm a'),
    },
    {
      start: formatInTimeZone(
        booking.startTime,
        booking.host.timezone || booking.timezone,
        'EEEE, MMMM d, yyyy h:mm a'
      ),
      end: formatInTimeZone(
        booking.endTime,
        booking.host.timezone || booking.timezone,
        'h:mm a'
      ),
    },
    isHost,
    reason || undefined
  ).catch(console.error)

  // Webhook
  const bulkWebhookPayload = buildWebhookBookingPayload({
    booking: {
      ...booking,
      startTime: newStart,
      endTime: newEnd,
      responses: booking.responses as Record<string, unknown> | null,
    },
    eventType: booking.eventType,
    host: booking.host,
  })

  triggerBookingRescheduledWebhook(
    booking.hostId,
    bulkWebhookPayload as Parameters<typeof triggerBookingRescheduledWebhook>[1],
    booking.startTime,
    booking.endTime
  ).catch(console.error)

  sendBookingInAppNotification({
    type: 'BOOKING_RESCHEDULED',
    hostId: booking.hostId,
    bookingId: booking.id,
    inviteeName: booking.inviteeName,
    eventTitle: booking.eventType.title,
    startTimeDisplay: `${futureBookings.length} sessions rescheduled`,
    isHost,
  })

  return {
    message: `${futureBookings.length} booking(s) rescheduled successfully`,
    updatedCount: futureBookings.length,
  }
}

async function rescheduleSingle(params: {
  booking: RescheduleBookingData
  newStart: Date
  newEnd: Date
  reason?: string
  isHost: boolean
}): Promise<RescheduleBookingResult> {
  const { booking, newStart, newEnd, reason, isHost } = params
  const conflictUserIds = getConflictUserIds(booking)

  // Store old times for email
  const oldStartFormatted = formatInTimeZone(
    booking.startTime,
    booking.timezone,
    'EEEE, MMMM d, yyyy h:mm a'
  )
  const oldEndFormatted = formatInTimeZone(booking.endTime, booking.timezone, 'h:mm a')
  const hostTimezone = booking.host.timezone || booking.timezone
  const hostOldStartFormatted = formatInTimeZone(
    booking.startTime,
    hostTimezone,
    'EEEE, MMMM d, yyyy h:mm a'
  )
  const hostOldEndFormatted = formatInTimeZone(booking.endTime, hostTimezone, 'h:mm a')

  // Atomic reschedule with serializable transaction
  const MAX_RESCHEDULE_RETRIES = 3
  let updatedBooking: Awaited<ReturnType<typeof prisma.booking.update>> | undefined

  for (let attempt = 0; attempt < MAX_RESCHEDULE_RETRIES; attempt++) {
    try {
      updatedBooking = await prisma.$transaction(
        async (tx) => {
          const conflict = await tx.booking.findFirst({
            where: {
              OR: [
                { hostId: { in: conflictUserIds } },
                { assignedUserId: { in: conflictUserIds } },
              ],
              id: { not: booking.id },
              status: { in: ['PENDING', 'CONFIRMED'] },
              startTime: { lt: newEnd },
              endTime: { gt: newStart },
            },
          })

          if (conflict) {
            throw new Error('RESCHEDULE_CONFLICT')
          }

          return tx.booking.update({
            where: { id: booking.id },
            data: {
              startTime: newStart,
              endTime: newEnd,
              rescheduleReason: reason || null,
              lastRescheduledAt: new Date(),
            },
          })
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
      break
    } catch (txError) {
      if (txError instanceof Error && txError.message === 'RESCHEDULE_CONFLICT') {
        throw new RescheduleConflictError()
      }
      const isSerializationFailure =
        txError instanceof Error &&
        'code' in txError &&
        (txError as { code: string }).code === 'P2034'
      if (isSerializationFailure && attempt < MAX_RESCHEDULE_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)))
        continue
      }
      throw txError
    }
  }

  if (!updatedBooking) {
    throw new Error('Reschedule transaction failed unexpectedly')
  }

  // Update calendar events
  await updateCalendarEventsForBooking(
    booking.hostId,
    booking.id,
    booking.calendarEventId,
    booking.calendarEventIds,
    newStart,
    newEnd
  )

  // Email
  const teamMembersForEmail = extractTeamMembersForEmail(booking.eventType)
  const emailData = buildBookingEmailData({
    booking: { ...booking, startTime: newStart, endTime: newEnd },
    host: booking.host,
    eventType: booking.eventType,
    teamMembers: teamMembersForEmail,
  })

  queueBookingRescheduledEmails(
    emailData,
    { start: oldStartFormatted, end: oldEndFormatted },
    { start: hostOldStartFormatted, end: hostOldEndFormatted },
    isHost,
    reason || undefined
  ).catch(console.error)

  // Reminders
  rescheduleBookingReminders(booking.id, booking.uid, newStart).catch(console.error)

  // Webhook
  const webhookPayload = buildWebhookBookingPayload({
    booking: {
      ...booking,
      startTime: newStart,
      endTime: newEnd,
      responses: booking.responses as Record<string, unknown> | null,
    },
    eventType: booking.eventType,
    host: booking.host,
  })

  triggerBookingRescheduledWebhook(
    booking.hostId,
    webhookPayload as Parameters<typeof triggerBookingRescheduledWebhook>[1],
    booking.startTime,
    booking.endTime
  ).catch(console.error)

  sendBookingInAppNotification({
    type: 'BOOKING_RESCHEDULED',
    hostId: booking.hostId,
    bookingId: booking.id,
    inviteeName: booking.inviteeName,
    eventTitle: booking.eventType.title,
    startTimeDisplay: formatInTimeZone(newStart, booking.timezone, 'MMM d, h:mm a'),
    isHost,
  })

  return {
    message: 'Booking rescheduled successfully',
    booking: {
      id: updatedBooking.id,
      uid: updatedBooking.uid,
      startTime: updatedBooking.startTime,
      endTime: updatedBooking.endTime,
    },
  }
}
