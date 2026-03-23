/**
 * Confirm, reject, skip, and unskip bookings.
 *
 * Handles single and bulk (all_pending) operations for recurring series.
 * Manages calendar events, meeting links, emails, webhooks, reminders.
 */

import { formatInTimeZone } from 'date-fns-tz'
import prisma from '@/server/db/prisma'
import type { BookingStatus } from '@/generated/prisma/client'
import { deleteAllCalendarEvents } from '@/server/integrations/calendar/event-ids'
import { RecurringBookingEmailData } from '@/server/integrations/email/client'
import {
  queueBookingConfirmedByHostEmail,
  queueBookingRejectedEmail,
  queueBulkConfirmedByHostEmail,
  scheduleBookingReminders,
  cancelBookingReminders,
  triggerBookingConfirmedWebhook,
  triggerBookingRejectedWebhook,
} from '@/server/infrastructure/queue'
import { createNotification, buildBookingNotification } from '@/server/notifications'
import { FREQUENCY_LABELS, type RecurringFrequency } from '@/lib/scheduling/recurring/utils'
import {
  extractTeamMembersForEmail,
  buildBookingEmailData,
  buildWebhookBookingPayload,
} from './booking-helpers'
import { generateMeetingLinkOnConfirm } from './generate-meeting-link'

// ── Domain errors ─────────────────────────────────────────────────────────────

export class BookingNotPendingError extends Error {
  constructor(message = 'Booking not found or is not pending') {
    super(message)
    this.name = 'BookingNotPendingError'
  }
}

export class SkipNotRecurringError extends Error {
  constructor() {
    super('Only recurring bookings can be skipped')
    this.name = 'SkipNotRecurringError'
  }
}

export class BookingAccessDeniedError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'BookingAccessDeniedError'
  }
}

// ── Skip / Unskip ─────────────────────────────────────────────────────────────

export interface SkipBookingParams {
  id: string
  action: 'skip' | 'unskip'
  sessionUserId: string
}

export interface SkipBookingResult {
  message: string
  status: string
}

export async function skipOrUnskipBooking(params: SkipBookingParams): Promise<SkipBookingResult> {
  const { id, action, sessionUserId } = params

  const expectedStatus =
    action === 'skip'
      ? { in: ['PENDING', 'CONFIRMED'] as ('PENDING' | 'CONFIRMED')[] }
      : ('SKIPPED' as const)

  const booking = await prisma.booking.findFirst({
    where: {
      OR: [{ id }, { uid: id }],
      status: expectedStatus,
    },
    include: {
      eventType: {
        select: {
          title: true,
          slug: true,
          length: true,
          description: true,
          requiresConfirmation: true,
        },
      },
      host: {
        select: { id: true, name: true, email: true, username: true, timezone: true },
      },
    },
  })

  if (!booking) {
    throw new BookingNotPendingError(
      action === 'skip'
        ? 'Booking not found or cannot be skipped'
        : 'Booking not found or is not skipped'
    )
  }

  if (sessionUserId !== booking.hostId) {
    throw new BookingAccessDeniedError()
  }

  if (!booking.recurringGroupId) {
    throw new SkipNotRecurringError()
  }

  const newStatus =
    action === 'skip'
      ? 'SKIPPED'
      : booking.eventType.requiresConfirmation
        ? 'PENDING'
        : 'CONFIRMED'

  await prisma.booking.update({
    where: { id: booking.id },
    data: { status: newStatus },
  })

  if (action === 'skip') {
    deleteAllCalendarEvents(booking.hostId, booking.calendarEventId, booking.calendarEventIds)
    cancelBookingReminders(booking.uid).catch(console.error)
  } else {
    if (newStatus === 'CONFIRMED') {
      scheduleBookingReminders(booking.id, booking.uid, booking.startTime).catch(console.error)
    }
  }

  // Notification
  const notifType = action === 'skip' ? 'BOOKING_CANCELLED' : 'BOOKING_CONFIRMED'
  const notif = buildBookingNotification(notifType, {
    inviteeName: booking.inviteeName,
    eventTitle: booking.eventType.title,
    startTime: formatInTimeZone(booking.startTime, booking.timezone, 'MMM d, h:mm a'),
  })
  createNotification({
    userId: booking.hostId,
    type: notifType,
    ...notif,
    bookingId: booking.id,
  }).catch(console.error)

  return {
    message: action === 'skip' ? 'Occurrence skipped' : 'Occurrence restored',
    status: newStatus,
  }
}

// ── Confirm / Reject ──────────────────────────────────────────────────────────

export interface ConfirmRejectParams {
  id: string
  action: 'confirm' | 'reject'
  reason?: string
  scope?: 'this' | 'all_pending'
  sessionUserId: string
}

export interface ConfirmRejectResult {
  message: string
  status: string
  updatedCount?: number
}

export async function confirmOrRejectBooking(
  params: ConfirmRejectParams
): Promise<ConfirmRejectResult> {
  const { id, action, reason, scope, sessionUserId } = params

  // Find the booking (must be PENDING)
  const booking = await prisma.booking.findFirst({
    where: {
      OR: [{ id }, { uid: id }],
      status: 'PENDING',
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
    throw new BookingNotPendingError()
  }

  // Only the host or team members can confirm/reject
  const isTeamMember = booking.eventType.teamMemberAssignments?.some(
    (a: { teamMember: { userId: string } }) => a.teamMember.userId === sessionUserId
  )
  if (sessionUserId !== booking.hostId && !isTeamMember) {
    throw new BookingAccessDeniedError()
  }

  const newStatus: BookingStatus = action === 'confirm' ? 'CONFIRMED' : 'REJECTED'

  // ── Bulk scope: confirm/reject ALL pending in series ────────────────────
  if (scope === 'all_pending' && booking.recurringGroupId) {
    return confirmOrRejectBulk({ booking, action, reason, newStatus })
  }

  // ── Single scope (default) ─────────────────────────────────────────────
  return confirmOrRejectSingle({ booking, action, reason, newStatus })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function confirmOrRejectBulk(params: {
  booking: Awaited<ReturnType<typeof findPendingBooking>>
  action: 'confirm' | 'reject'
  reason?: string
  newStatus: BookingStatus
}): Promise<ConfirmRejectResult> {
  const { booking, action, reason, newStatus } = params

  const pendingBookings = await prisma.booking.findMany({
    where: {
      recurringGroupId: booking.recurringGroupId,
      status: 'PENDING',
    },
    orderBy: { startTime: 'asc' },
    select: {
      id: true,
      uid: true,
      startTime: true,
      endTime: true,
      timezone: true,
      calendarEventId: true,
      calendarEventIds: true,
      recurringFrequency: true,
      inviteeName: true,
      inviteeEmail: true,
      hostId: true,
      eventTypeId: true,
      location: true,
      meetingUrl: true,
      inviteePhone: true,
      inviteeNotes: true,
      responses: true,
      recurringGroupId: true,
      status: true,
    },
  })

  if (pendingBookings.length === 0) {
    throw new BookingNotPendingError('No pending bookings found in this series')
  }

  // Bulk update all pending bookings
  await prisma.booking.updateMany({
    where: {
      recurringGroupId: booking.recurringGroupId,
      status: 'PENDING',
    },
    data: {
      status: newStatus,
      ...(action === 'reject' && {
        cancellationReason: reason,
        cancelledAt: new Date(),
      }),
    },
  })

  if (action === 'confirm') {
    // Schedule reminders for each confirmed occurrence
    for (const pb of pendingBookings) {
      scheduleBookingReminders(pb.id, pb.uid, pb.startTime).catch(console.error)
    }

    // Send one bulk confirmed email with all dates
    const bulkHostTimezone = booking.host.timezone || booking.timezone
    const recurringEmailData: RecurringBookingEmailData = {
      hostName: booking.host.name ?? 'Host',
      hostEmail: booking.host.email!,
      hostUsername: booking.host.username ?? undefined,
      inviteeName: booking.inviteeName,
      inviteeEmail: booking.inviteeEmail,
      eventTitle: booking.eventType.title,
      eventSlug: booking.eventType.slug,
      eventDescription: booking.eventType.description ?? undefined,
      startTime: formatInTimeZone(
        pendingBookings[0].startTime,
        pendingBookings[0].timezone,
        'EEEE, MMMM d, yyyy h:mm a'
      ),
      endTime: formatInTimeZone(pendingBookings[0].endTime, pendingBookings[0].timezone, 'h:mm a'),
      timezone: booking.timezone,
      hostStartTime: formatInTimeZone(
        pendingBookings[0].startTime,
        bulkHostTimezone,
        'EEEE, MMMM d, yyyy h:mm a'
      ),
      hostEndTime: formatInTimeZone(pendingBookings[0].endTime, bulkHostTimezone, 'h:mm a'),
      hostTimezone: bulkHostTimezone,
      location: booking.location ?? undefined,
      meetingUrl: booking.meetingUrl ?? undefined,
      bookingUid: pendingBookings[0].uid,
      teamMembers: extractTeamMembersForEmail(booking.eventType),
      recurringDates: pendingBookings.map((pb) => ({
        startTime: formatInTimeZone(pb.startTime, pb.timezone, 'EEEE, MMMM d, yyyy h:mm a'),
        endTime: formatInTimeZone(pb.endTime, pb.timezone, 'h:mm a'),
      })),
      hostRecurringDates: pendingBookings.map((pb) => ({
        startTime: formatInTimeZone(pb.startTime, bulkHostTimezone, 'EEEE, MMMM d, yyyy h:mm a'),
        endTime: formatInTimeZone(pb.endTime, bulkHostTimezone, 'h:mm a'),
      })),
      totalOccurrences: pendingBookings.length,
      frequencyLabel: booking.recurringFrequency
        ? FREQUENCY_LABELS[booking.recurringFrequency as RecurringFrequency]?.toLowerCase()
        : undefined,
    }
    queueBulkConfirmedByHostEmail(recurringEmailData).catch(console.error)

    // Webhook
    triggerBookingConfirmedWebhook(
      booking.hostId,
      buildWebhookBookingPayload({
        booking: { ...booking, responses: booking.responses as Record<string, unknown> | null },
        eventType: booking.eventType,
        host: booking.host,
        statusOverride: newStatus,
      })
    ).catch(console.error)
  } else {
    // Reject: delete calendar events
    const bulkRejectCalendarOwnerId = booking.eventType.meetingOrganizerUserId || booking.hostId
    for (const pb of pendingBookings) {
      deleteAllCalendarEvents(bulkRejectCalendarOwnerId, pb.calendarEventId, pb.calendarEventIds)
    }

    const bulkRejectTeamMembers = extractTeamMembersForEmail(booking.eventType)

    queueBookingRejectedEmail(
      {
        hostName: booking.host.name ?? 'Host',
        hostEmail: booking.host.email!,
        hostUsername: booking.host.username ?? undefined,
        inviteeName: booking.inviteeName,
        inviteeEmail: booking.inviteeEmail,
        eventTitle: booking.eventType.title,
        eventSlug: booking.eventType.slug,
        startTime: `${pendingBookings.length} sessions`,
        endTime: '',
        timezone: booking.timezone,
        bookingUid: booking.uid,
        teamMembers: bulkRejectTeamMembers,
      },
      reason
    ).catch(console.error)

    triggerBookingRejectedWebhook(
      booking.hostId,
      buildWebhookBookingPayload({
        booking: { ...booking, responses: booking.responses as Record<string, unknown> | null },
        eventType: booking.eventType,
        host: booking.host,
        statusOverride: newStatus,
      }),
      reason
    ).catch(console.error)
  }

  // Notification
  const bulkNotif = buildBookingNotification(
    action === 'confirm' ? 'BOOKING_CONFIRMED' : 'BOOKING_REJECTED',
    {
      inviteeName: booking.inviteeName,
      eventTitle: booking.eventType.title,
      startTime: `${pendingBookings.length} sessions ${action === 'confirm' ? 'confirmed' : 'rejected'}`,
    }
  )
  createNotification({
    userId: booking.hostId,
    type: action === 'confirm' ? 'BOOKING_CONFIRMED' : 'BOOKING_REJECTED',
    ...bulkNotif,
    bookingId: booking.id,
  }).catch(console.error)

  return {
    message: `${pendingBookings.length} booking(s) ${action === 'confirm' ? 'confirmed' : 'rejected'} successfully`,
    status: newStatus,
    updatedCount: pendingBookings.length,
  }
}

async function confirmOrRejectSingle(params: {
  booking: Awaited<ReturnType<typeof findPendingBooking>>
  action: 'confirm' | 'reject'
  reason?: string
  newStatus: BookingStatus
}): Promise<ConfirmRejectResult> {
  const { booking, action, reason, newStatus } = params

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: newStatus,
      ...(action === 'reject' && {
        cancellationReason: reason,
        cancelledAt: new Date(),
      }),
    },
  })

  // Build teamMembers for email
  const patchTeamMembers = extractTeamMembersForEmail(booking.eventType)

  // Prepare email data
  const emailData = buildBookingEmailData({
    booking,
    host: booking.host,
    eventType: booking.eventType,
    teamMembers: patchTeamMembers,
  })

  // Build webhook payload data
  const webhookBookingData = buildWebhookBookingPayload({
    booking: { ...booking, responses: booking.responses as Record<string, unknown> | null },
    eventType: booking.eventType,
    host: booking.host,
    statusOverride: newStatus,
  })

  // On confirm: generate meeting link now (deferred during booking creation for pending bookings)
  if (action === 'confirm' && !booking.meetingUrl) {
    try {
      const generatedMeetingUrl = await generateMeetingLinkOnConfirm({
        booking,
        eventType: booking.eventType,
        host: booking.host,
      })

      if (generatedMeetingUrl) {
        emailData.meetingUrl = generatedMeetingUrl
      }
    } catch (error) {
      console.error('Failed to create meeting link on confirm:', error)
    }
  }

  // Send appropriate email, schedule reminders, and trigger webhooks
  if (action === 'confirm') {
    queueBookingConfirmedByHostEmail(emailData).catch(console.error)
    scheduleBookingReminders(booking.id, booking.uid, booking.startTime).catch(console.error)
    triggerBookingConfirmedWebhook(booking.hostId, webhookBookingData).catch(console.error)
  } else {
    // Delete calendar events if rejecting
    const rejectCalOwnerId = booking.eventType.meetingOrganizerUserId || booking.hostId
    await deleteAllCalendarEvents(rejectCalOwnerId, booking.calendarEventId, booking.calendarEventIds, {
      sync: true,
    })
    queueBookingRejectedEmail(emailData, reason).catch(console.error)
    triggerBookingRejectedWebhook(booking.hostId, webhookBookingData, reason).catch(console.error)
  }

  return {
    message: `Booking ${action === 'confirm' ? 'confirmed' : 'rejected'} successfully`,
    status: newStatus,
  }
}

// Type helper — not exported, used for internal typing only
async function findPendingBooking() {
  return prisma.booking.findFirstOrThrow({
    where: { status: 'PENDING' },
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
}
