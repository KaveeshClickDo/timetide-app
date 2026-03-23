/**
 * Cancel a booking (single or all future in a recurring series).
 *
 * Handles authorization (host, team member, invitee via email verification),
 * calendar cleanup, cancellation emails, webhooks, reminders, notifications.
 */

import { formatInTimeZone } from 'date-fns-tz'
import prisma from '@/server/db/prisma'
import {
  queueBookingCancellationEmails,
  cancelBookingReminders,
  triggerBookingCancelledWebhook,
} from '@/server/infrastructure/queue'
import {
  authorizeBookingAccess,
  extractTeamMembersForEmail,
  buildBookingEmailData,
  buildWebhookBookingPayload,
  cleanupBookingCalendarEvents,
  sendBookingInAppNotification,
} from './booking-helpers'

// ── Domain errors ─────────────────────────────────────────────────────────────

export class CancelBookingNotFoundError extends Error {
  constructor() {
    super('Booking not found or already cancelled')
    this.name = 'CancelBookingNotFoundError'
  }
}

export class CancelBookingUnauthorizedError extends Error {
  public status: number
  constructor(message = 'Unauthorized', status = 403) {
    super(message)
    this.name = 'CancelBookingUnauthorizedError'
    this.status = status
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CancelBookingParams {
  id: string
  reason?: string
  cancelAllFuture?: boolean
  sessionUserId?: string | null
  emailVerification?: {
    code: string
    signature: string
    expiresAt: number
  }
}

export interface CancelBookingResult {
  message: string
  cancelledCount?: number
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function cancelBooking(params: CancelBookingParams): Promise<CancelBookingResult> {
  const { id, reason, cancelAllFuture = false, sessionUserId, emailVerification } = params

  // Find the booking
  const booking = await prisma.booking.findFirst({
    where: {
      OR: [{ id }, { uid: id }],
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
    include: {
      eventType: {
        select: {
          title: true,
          slug: true,
          length: true,
          description: true,
          locationType: true,
          schedulingType: true,
          meetingOrganizerUserId: true,
          teamMemberAssignments: {
            where: { isActive: true },
            select: {
              teamMember: {
                select: {
                  userId: true,
                  user: { select: { name: true, email: true } },
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
          username: true,
          timezone: true,
        },
      },
    },
  })

  if (!booking) {
    throw new CancelBookingNotFoundError()
  }

  // Check authorization
  const authResult = authorizeBookingAccess({
    sessionUserId: sessionUserId ?? undefined,
    booking,
    accessId: id,
    emailVerification,
    purpose: 'cancel',
  })

  if (!authResult.authorized) {
    throw new CancelBookingUnauthorizedError(authResult.error, authResult.status || 403)
  }

  const { isHost } = authResult

  // ── Cancel all future (recurring series) ────────────────────────────────
  if (cancelAllFuture && booking.recurringGroupId) {
    return cancelAllFutureBookings({ booking, reason, isHost })
  }

  // ── Cancel single booking ──────────────────────────────────────────────
  return cancelSingleBooking({ booking, reason, isHost })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type BookingWithRelations = NonNullable<
  Awaited<ReturnType<typeof prisma.booking.findFirst<{
    include: {
      eventType: {
        select: {
          title: true
          slug: true
          length: true
          description: true
          locationType: true
          schedulingType: true
          meetingOrganizerUserId: true
          teamMemberAssignments: {
            where: { isActive: true }
            select: {
              teamMember: {
                select: {
                  userId: true
                  user: { select: { name: true; email: true } }
                }
              }
            }
          }
        }
      }
      host: {
        select: {
          id: true
          name: true
          email: true
          username: true
          timezone: true
        }
      }
    }
  }>>>
>

async function cancelAllFutureBookings(params: {
  booking: BookingWithRelations
  reason?: string
  isHost: boolean
}): Promise<CancelBookingResult> {
  const { booking, reason, isHost } = params

  const futureBookings = await prisma.booking.findMany({
    where: {
      recurringGroupId: booking.recurringGroupId,
      startTime: { gte: booking.startTime },
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
    include: {
      eventType: { select: { title: true, slug: true, length: true, description: true } },
      host: { select: { id: true, name: true, email: true, username: true, timezone: true } },
    },
  })

  // Cancel all in a batch
  await prisma.booking.updateMany({
    where: {
      id: { in: futureBookings.map((b) => b.id) },
    },
    data: {
      status: 'CANCELLED',
      cancellationReason: reason,
      cancelledAt: new Date(),
    },
  })

  // Delete calendar events and cancel reminders
  for (const fb of futureBookings) {
    await cleanupBookingCalendarEvents({
      bookingId: fb.id,
      hostId: booking.hostId,
      calendarEventId: fb.calendarEventId,
      calendarEventIds: fb.calendarEventIds,
      meetingOrganizerUserId: booking.eventType.meetingOrganizerUserId,
    })
    cancelBookingReminders(fb.uid).catch(console.error)
  }

  // Build teamMembers for email
  const bulkCancelTeamMembers = extractTeamMembersForEmail(booking.eventType)

  // Send one cancellation email for the series
  const bulkCancelStartTimeStr =
    futureBookings.length === 1
      ? formatInTimeZone(
          futureBookings[0].startTime,
          futureBookings[0].timezone,
          'EEEE, MMMM d, yyyy h:mm a'
        )
      : `${futureBookings.length} sessions (${formatInTimeZone(futureBookings[0].startTime, futureBookings[0].timezone, 'MMM d')} - ${formatInTimeZone(futureBookings[futureBookings.length - 1].startTime, futureBookings[futureBookings.length - 1].timezone, 'MMM d, yyyy')})`
  const bulkCancelHostTz = booking.host.timezone || booking.timezone
  const bulkCancelHostStartTimeStr =
    futureBookings.length === 1
      ? formatInTimeZone(futureBookings[0].startTime, bulkCancelHostTz, 'EEEE, MMMM d, yyyy h:mm a')
      : `${futureBookings.length} sessions (${formatInTimeZone(futureBookings[0].startTime, bulkCancelHostTz, 'MMM d')} - ${formatInTimeZone(futureBookings[futureBookings.length - 1].startTime, bulkCancelHostTz, 'MMM d, yyyy')})`

  const emailData = buildBookingEmailData({
    booking,
    host: booking.host,
    eventType: booking.eventType,
    teamMembers: bulkCancelTeamMembers,
    overrides: {
      startTime: bulkCancelStartTimeStr,
      hostStartTime: bulkCancelHostStartTimeStr,
    },
  })
  queueBookingCancellationEmails(emailData, reason, isHost).catch(console.error)

  // Notification
  sendBookingInAppNotification({
    type: 'BOOKING_CANCELLED',
    hostId: booking.hostId,
    bookingId: booking.id,
    inviteeName: booking.inviteeName,
    eventTitle: booking.eventType.title,
    startTimeDisplay: `${futureBookings.length} sessions cancelled`,
    isHost,
  })

  return {
    message: `Cancelled ${futureBookings.length} booking(s)`,
    cancelledCount: futureBookings.length,
  }
}

async function cancelSingleBooking(params: {
  booking: BookingWithRelations
  reason?: string
  isHost: boolean
}): Promise<CancelBookingResult> {
  const { booking, reason, isHost } = params

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: 'CANCELLED',
      cancellationReason: reason,
      cancelledAt: new Date(),
    },
  })

  // Delete calendar events
  await cleanupBookingCalendarEvents({
    bookingId: booking.id,
    hostId: booking.hostId,
    calendarEventId: booking.calendarEventId,
    calendarEventIds: booking.calendarEventIds,
    meetingOrganizerUserId: booking.eventType.meetingOrganizerUserId,
    sync: true,
  })

  // Build teamMembers for email
  const cancelTeamMembers = extractTeamMembersForEmail(booking.eventType)

  // Send cancellation emails
  const emailData = buildBookingEmailData({
    booking,
    host: booking.host,
    eventType: booking.eventType,
    teamMembers: cancelTeamMembers,
  })

  queueBookingCancellationEmails(emailData, reason, isHost).catch(console.error)
  cancelBookingReminders(booking.uid).catch(console.error)

  triggerBookingCancelledWebhook(
    booking.hostId,
    buildWebhookBookingPayload({
      booking: { ...booking, responses: booking.responses as Record<string, unknown> | null },
      eventType: booking.eventType,
      host: booking.host,
      statusOverride: 'CANCELLED',
    }),
    reason
  ).catch(console.error)

  sendBookingInAppNotification({
    type: 'BOOKING_CANCELLED',
    hostId: booking.hostId,
    bookingId: booking.id,
    inviteeName: booking.inviteeName,
    eventTitle: booking.eventType.title,
    startTimeDisplay: formatInTimeZone(booking.startTime, booking.timezone, 'MMM d, h:mm a'),
    isHost,
  })

  return {
    message: 'Booking cancelled successfully',
  }
}
