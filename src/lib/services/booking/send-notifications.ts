/**
 * Post-booking notifications: emails, webhooks, reminders, analytics, in-app.
 *
 * All operations are fire-and-forget (.catch) so failures don't block the
 * booking response. The route handler calls this after the booking transaction
 * and calendar event creation are complete.
 */

import { startOfDay } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { FREQUENCY_LABELS, type RecurringFrequency } from '@/lib/scheduling/recurring/utils'
import prisma from '@/lib/prisma'
import { createNotification, buildBookingNotification } from '@/lib/notifications'
import { type BookingEmailData, type RecurringBookingEmailData } from '@/lib/integrations/email/client'
import {
  queueBookingConfirmationEmails,
  queueRecurringBookingConfirmationEmails,
  queueBookingPendingEmails,
  scheduleBookingReminders,
  triggerBookingCreatedWebhook,
} from '@/lib/infrastructure/queue'
import type { HostInfo } from './select-team-member'

interface BookingRecord {
  id: string
  uid: string
  status: string
  startTime: Date
  endTime: Date
  meetingUrl: string | null
}

interface TeamMemberAssignment {
  teamMember: {
    user: {
      name: string | null
      email: string | null
    }
  }
}

/**
 * Fire all post-booking side effects: emails, reminders, webhooks, analytics,
 * and in-app notifications. All are fire-and-forget.
 */
export function sendBookingNotifications(params: {
  selectedHost: HostInfo
  createdBookings: BookingRecord[]
  eventTypeId: string
  eventTitle: string
  eventSlug: string
  eventDescription: string | null
  eventLength: number
  requiresConfirmation: boolean
  inviteeName: string
  inviteeEmail: string
  inviteePhone: string | null | undefined
  inviteeNotes: string | null | undefined
  responses: Record<string, unknown> | null | undefined
  timezone: string
  location: string | undefined
  meetingUrl: string | undefined
  isRecurring: boolean
  occurrenceCount: number
  recurringFrequency: RecurringFrequency
  schedulingType: string | null
  teamMemberAssignments: TeamMemberAssignment[]
}): void {
  const {
    selectedHost,
    createdBookings,
    eventTypeId,
    eventTitle,
    eventSlug,
    eventDescription,
    eventLength,
    requiresConfirmation,
    inviteeName,
    inviteeEmail,
    inviteePhone,
    inviteeNotes,
    responses,
    timezone,
    location,
    meetingUrl,
    isRecurring,
    occurrenceCount,
    recurringFrequency,
    schedulingType,
    teamMemberAssignments,
  } = params

  const primaryBooking = createdBookings[0]
  const hostTimezone = selectedHost.timezone || 'UTC'
  const startDate = primaryBooking.startTime

  // ─── Team members list for collective events ───────────────────────────────

  const teamMembersForEmail = schedulingType === 'COLLECTIVE' && teamMemberAssignments.length > 0
    ? teamMemberAssignments
        .map(a => ({
          name: a.teamMember.user.name ?? 'Team Member',
          email: a.teamMember.user.email!,
        }))
        .filter(m => m.email)
    : undefined

  // ─── Email data ────────────────────────────────────────────────────────────

  const emailData: BookingEmailData = {
    hostName: selectedHost.name ?? 'Host',
    hostEmail: selectedHost.email!,
    hostUsername: selectedHost.username ?? undefined,
    inviteeName,
    inviteeEmail,
    eventTitle,
    eventSlug,
    eventDescription: eventDescription ?? undefined,
    startTime: formatInTimeZone(startDate, timezone, 'EEEE, MMMM d, yyyy h:mm a'),
    endTime: formatInTimeZone(createdBookings[0].endTime, timezone, 'h:mm a'),
    timezone,
    hostStartTime: formatInTimeZone(startDate, hostTimezone, 'EEEE, MMMM d, yyyy h:mm a'),
    hostEndTime: formatInTimeZone(createdBookings[0].endTime, hostTimezone, 'h:mm a'),
    hostTimezone,
    location,
    meetingUrl: meetingUrl ?? undefined,
    bookingUid: primaryBooking.uid,
    notes: inviteeNotes ?? undefined,
    teamMembers: teamMembersForEmail,
  }

  // ─── Emails + reminders ────────────────────────────────────────────────────

  if (requiresConfirmation) {
    queueBookingPendingEmails(emailData).catch(console.error)
  } else if (isRecurring && occurrenceCount > 1) {
    const recurringEmailData: RecurringBookingEmailData = {
      ...emailData,
      totalOccurrences: occurrenceCount,
      frequencyLabel: FREQUENCY_LABELS[recurringFrequency]?.toLowerCase() || 'recurring',
      recurringDates: createdBookings.map(b => ({
        startTime: formatInTimeZone(b.startTime, timezone, 'EEEE, MMMM d, yyyy h:mm a'),
        endTime: formatInTimeZone(b.endTime, timezone, 'h:mm a'),
      })),
      hostRecurringDates: createdBookings.map(b => ({
        startTime: formatInTimeZone(b.startTime, hostTimezone, 'EEEE, MMMM d, yyyy h:mm a'),
        endTime: formatInTimeZone(b.endTime, hostTimezone, 'h:mm a'),
      })),
    }
    queueRecurringBookingConfirmationEmails(recurringEmailData).catch(console.error)

    for (const booking of createdBookings) {
      scheduleBookingReminders(booking.id, booking.uid, booking.startTime).catch(console.error)
    }
  } else {
    queueBookingConfirmationEmails(emailData).catch(console.error)

    for (const booking of createdBookings) {
      scheduleBookingReminders(booking.id, booking.uid, booking.startTime).catch(console.error)
    }
  }

  // ─── Analytics ─────────────────────────────────────────────────────────────

  prisma.bookingAnalytics.upsert({
    where: {
      eventTypeId_date: {
        eventTypeId,
        date: startOfDay(new Date()),
      },
    },
    create: {
      eventTypeId,
      date: startOfDay(new Date()),
      bookings: occurrenceCount,
    },
    update: {
      bookings: { increment: occurrenceCount },
    },
  }).catch((err) => { console.warn('Analytics update failed:', err) })

  // ─── Webhook ───────────────────────────────────────────────────────────────

  triggerBookingCreatedWebhook(selectedHost.id, {
    id: primaryBooking.id,
    uid: primaryBooking.uid,
    status: primaryBooking.status,
    startTime: startDate,
    endTime: primaryBooking.endTime,
    timezone,
    location,
    meetingUrl,
    inviteeName,
    inviteeEmail,
    inviteePhone: inviteePhone ?? undefined,
    inviteeNotes: inviteeNotes ?? undefined,
    responses: responses ?? null,
    eventType: {
      id: eventTypeId,
      title: eventTitle,
      slug: eventSlug,
      length: eventLength,
    },
    host: {
      id: selectedHost.id,
      name: selectedHost.name,
      email: selectedHost.email!,
    },
  }).catch(console.error)

  // ─── In-app notification ───────────────────────────────────────────────────

  const notifData = buildBookingNotification('BOOKING_CREATED', {
    inviteeName,
    eventTitle,
    startTime: isRecurring
      ? `${occurrenceCount} ${FREQUENCY_LABELS[recurringFrequency] || 'recurring'} sessions starting ${formatInTimeZone(startDate, selectedHost.timezone || 'UTC', 'MMM d, h:mm a')}`
      : formatInTimeZone(startDate, selectedHost.timezone || 'UTC', 'MMM d, h:mm a'),
  })
  createNotification({
    userId: selectedHost.id,
    type: 'BOOKING_CREATED',
    ...notifData,
    bookingId: primaryBooking.id,
  }).catch(console.error)
}
