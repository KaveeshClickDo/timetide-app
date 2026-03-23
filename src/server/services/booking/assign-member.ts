/**
 * Assign a team member to a MANAGED booking.
 * Also provides available members listing for assignment UI.
 *
 * Handles Zoom meeting creation, calendar event creation on all providers,
 * auto-confirmation, confirmation emails, and reminders.
 */

import { addMinutes } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import prisma from '@/server/db/prisma'
import { CALENDAR_FETCH_BUFFER_MINUTES } from '@/server/api-constants'
import {
  queueBookingConfirmationEmails,
  scheduleBookingReminders,
} from '@/server/infrastructure/queue'
import { BookingEmailData } from '@/server/integrations/email/client'
import {
  getAllBusyTimes,
  createGoogleCalendarEvent,
  type CreateCalendarEventParams,
  type CreateCalendarEventResult,
} from '@/server/integrations/calendar/google'
import { createOutlookCalendarEvent } from '@/server/integrations/calendar/outlook'
import { createZoomMeeting, hasZoomConnected } from '@/server/integrations/zoom'
import {
  buildCalendarEventIdsUpdate,
  type CalendarEventIds,
} from '@/server/integrations/calendar/event-ids'
import { mergeBusyTimes, isSlotAvailable } from '@/server/scheduling/slots/calculator'

// ── Domain errors ─────────────────────────────────────────────────────────────

export class AssignBookingNotFoundError extends Error {
  constructor() {
    super('Booking not found or cannot be modified')
    this.name = 'AssignBookingNotFoundError'
  }
}

export class AssignUnauthorizedError extends Error {
  constructor() {
    super('Only team admins or the host can assign members')
    this.name = 'AssignUnauthorizedError'
  }
}

export class AssignNotManagedError extends Error {
  constructor() {
    super('Member assignment is only available for MANAGED scheduling type')
    this.name = 'AssignNotManagedError'
  }
}

export class AssignMemberNotFoundError extends Error {
  constructor() {
    super('Assigned user is not an active team member for this event type')
    this.name = 'AssignMemberNotFoundError'
  }
}

// ── Assign member ─────────────────────────────────────────────────────────────

export interface AssignMemberParams {
  bookingId: string
  assignedUserId: string
  sessionUserId: string
}

export interface AssignMemberResult {
  booking: {
    id: string
    uid: string
    assignedUserId: string | null
    assignedMemberName: string | null
    status: string
  }
}

export async function assignTeamMember(params: AssignMemberParams): Promise<AssignMemberResult> {
  const { bookingId, assignedUserId, sessionUserId } = params

  // Find the booking
  const booking = await prisma.booking.findFirst({
    where: {
      OR: [{ id: bookingId }, { uid: bookingId }],
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
    include: {
      eventType: {
        include: {
          team: {
            include: {
              members: {
                where: {
                  userId: sessionUserId,
                  role: { in: ['OWNER', 'ADMIN'] },
                },
              },
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
                      timezone: true,
                    },
                  },
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
        },
      },
    },
  })

  if (!booking) {
    throw new AssignBookingNotFoundError()
  }

  // Check authorization - must be team admin/owner or host
  const isTeamAdmin =
    booking.eventType.team?.members && booking.eventType.team.members.length > 0
  const isHost = booking.hostId === sessionUserId

  if (!isTeamAdmin && !isHost) {
    throw new AssignUnauthorizedError()
  }

  // Verify this is a MANAGED scheduling type event
  if (booking.eventType.schedulingType !== 'MANAGED') {
    throw new AssignNotManagedError()
  }

  // Verify the assigned user is an active team member for this event
  const assignedMember = booking.eventType.teamMemberAssignments.find(
    (a) => a.teamMember.user.id === assignedUserId
  )

  if (!assignedMember) {
    throw new AssignMemberNotFoundError()
  }

  // Update the booking with the assigned member
  const updatedBooking = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      assignedUserId,
      status: booking.status === 'PENDING' ? 'CONFIRMED' : booking.status,
    },
  })

  // Create calendar event and meeting link for the assigned member
  const assignedUser = assignedMember.teamMember.user
  let assignedMeetingUrl = booking.meetingUrl

  try {
    // Create Zoom meeting if needed
    if (booking.eventType.locationType === 'ZOOM' && !booking.meetingUrl) {
      const hasZoom = await hasZoomConnected(assignedUserId)
      if (hasZoom) {
        const zoomMeeting = await createZoomMeeting({
          userId: assignedUserId,
          topic: `${booking.eventType.title} with ${booking.inviteeName}`,
          startTime: booking.startTime,
          duration: booking.eventType.length,
          timezone: booking.timezone,
          agenda: `Booked via TimeTide with ${booking.inviteeName} (${booking.inviteeEmail})`,
        })

        await prisma.booking.update({
          where: { id: booking.id },
          data: { meetingUrl: zoomMeeting.joinUrl },
        })
        assignedMeetingUrl = zoomMeeting.joinUrl
      }
    }

    // Find ALL enabled calendars for the assigned member
    const allCalendars = await prisma.calendar.findMany({
      where: { userId: assignedUserId, isEnabled: true },
    })

    if (allCalendars.length > 0) {
      const locationType = booking.eventType.locationType

      // Determine which calendar generates the meeting link
      let meetingLinkProvider: string | null = null
      if (locationType === 'GOOGLE_MEET') meetingLinkProvider = 'GOOGLE'
      else if (locationType === 'TEAMS') meetingLinkProvider = 'OUTLOOK'

      // Sort so meeting-link calendar processes first
      const sortedCalendars = [...allCalendars].sort((a, b) => {
        if (a.provider === meetingLinkProvider) return -1
        if (b.provider === meetingLinkProvider) return 1
        return 0
      })

      const calendarEventIds: CalendarEventIds = {}
      let currentMeetLink = assignedMeetingUrl

      for (const cal of sortedCalendars) {
        const isMeetingLinkCalendar = cal.provider === meetingLinkProvider
        const needsConferenceData = isMeetingLinkCalendar && !currentMeetLink

        const meetingInfo = currentMeetLink ? `\nMeeting: ${currentMeetLink}` : ''
        const eventParams: CreateCalendarEventParams = {
          calendarId: cal.id,
          summary: `${booking.eventType.title} with ${booking.inviteeName}`,
          description: `Booked via TimeTide\n\nInvitee: ${booking.inviteeName} (${booking.inviteeEmail})\nAssigned to: ${assignedUser.name ?? 'Team Member'}${meetingInfo}`,
          startTime: booking.startTime,
          endTime: booking.endTime,
          attendees: [
            { email: booking.inviteeEmail, name: booking.inviteeName },
            { email: assignedUser.email!, name: assignedUser.name ?? undefined },
          ],
          location: currentMeetLink || booking.location || undefined,
          conferenceData: needsConferenceData,
        }

        let result: CreateCalendarEventResult = { eventId: null, meetLink: null }

        try {
          if (cal.provider === 'GOOGLE') {
            result = await createGoogleCalendarEvent(eventParams)
          } else if (cal.provider === 'OUTLOOK') {
            result = await createOutlookCalendarEvent(eventParams)
          }
        } catch (calError) {
          console.error(`Failed to create ${cal.provider} calendar event:`, calError)
          continue
        }

        if (result.eventId) {
          calendarEventIds[cal.provider as 'GOOGLE' | 'OUTLOOK'] = result.eventId
        }

        if (result.meetLink && !currentMeetLink) {
          currentMeetLink = result.meetLink
          assignedMeetingUrl = result.meetLink
        }
      }

      // Update booking with all calendar event IDs and meeting URL
      const updateData: Record<string, unknown> = {
        ...buildCalendarEventIdsUpdate(calendarEventIds),
      }
      if (assignedMeetingUrl && !booking.meetingUrl) {
        updateData.meetingUrl = assignedMeetingUrl
      }

      await prisma.booking.update({
        where: { id: booking.id },
        data: updateData,
      })
    }
  } catch (error) {
    console.error('Failed to create calendar event for assigned member:', error)
  }

  // If status changed from PENDING to CONFIRMED, send confirmation emails and schedule reminders
  if (booking.status === 'PENDING' && updatedBooking.status === 'CONFIRMED') {
    const emailData: BookingEmailData = {
      hostName: assignedUser.name ?? 'Team Member',
      hostEmail: assignedUser.email!,
      inviteeName: booking.inviteeName,
      inviteeEmail: booking.inviteeEmail,
      eventTitle: booking.eventType.title,
      eventDescription: booking.eventType.description ?? undefined,
      startTime: formatInTimeZone(booking.startTime, booking.timezone, 'EEEE, MMMM d, yyyy h:mm a'),
      endTime: formatInTimeZone(booking.endTime, booking.timezone, 'h:mm a'),
      timezone: booking.timezone,
      location: booking.location ?? undefined,
      meetingUrl: assignedMeetingUrl ?? undefined,
      bookingUid: booking.uid,
    }

    queueBookingConfirmationEmails(emailData).catch(console.error)
    scheduleBookingReminders(booking.id, booking.uid, booking.startTime).catch(console.error)
  }

  return {
    booking: {
      id: updatedBooking.id,
      uid: updatedBooking.uid,
      assignedUserId: updatedBooking.assignedUserId,
      assignedMemberName: assignedMember.teamMember.user.name,
      status: updatedBooking.status,
    },
  }
}

// ── Get available members ─────────────────────────────────────────────────────

export interface GetAvailableMembersParams {
  bookingId: string
  sessionUserId: string
}

export async function getAvailableMembers(params: GetAvailableMembersParams) {
  const { bookingId, sessionUserId } = params

  const booking = await prisma.booking.findFirst({
    where: {
      OR: [{ id: bookingId }, { uid: bookingId }],
    },
    include: {
      eventType: {
        include: {
          team: {
            include: {
              members: {
                where: {
                  userId: sessionUserId,
                  role: { in: ['OWNER', 'ADMIN'] },
                },
              },
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
                      image: true,
                      timezone: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!booking) {
    throw new AssignBookingNotFoundError()
  }

  // Check authorization
  const isTeamAdmin =
    booking.eventType.team?.members && booking.eventType.team.members.length > 0
  const isHost = booking.hostId === sessionUserId

  if (!isTeamAdmin && !isHost) {
    throw new AssignUnauthorizedError()
  }

  // Get available members with availability status
  const activeMembers = booking.eventType.teamMemberAssignments.filter(
    (a) => a.teamMember.isActive
  )

  const availableMembers = await Promise.all(
    activeMembers.map(async (a) => {
      const memberId = a.teamMember.user.id
      let isAvailable = true

      try {
        // Check calendar busy times
        let busyTimes: { start: Date; end: Date }[] = []
        try {
          busyTimes = await getAllBusyTimes(
            memberId,
            addMinutes(booking.startTime, -CALENDAR_FETCH_BUFFER_MINUTES),
            addMinutes(booking.endTime, CALENDAR_FETCH_BUFFER_MINUTES)
          )
        } catch {
          // Calendar not connected
        }

        // Check DB bookings
        const memberBookings = await prisma.booking.findMany({
          where: {
            OR: [
              { hostId: memberId },
              { assignedUserId: memberId },
              { attendees: { some: { userId: memberId } } },
            ],
            status: { in: ['PENDING', 'CONFIRMED'] },
            startTime: { lt: booking.endTime },
            endTime: { gt: booking.startTime },
            id: { not: booking.id },
          },
          select: { startTime: true, endTime: true },
        })

        const allBusy = mergeBusyTimes([
          ...busyTimes,
          ...memberBookings.map((b) => ({ start: b.startTime, end: b.endTime })),
        ])

        isAvailable = isSlotAvailable(
          { start: booking.startTime, end: booking.endTime },
          allBusy,
          0,
          0
        )
      } catch {
        // If availability check fails, still show the member
      }

      return {
        id: memberId,
        teamMemberId: a.teamMember.id,
        name: a.teamMember.user.name,
        email: a.teamMember.user.email,
        image: a.teamMember.user.image,
        timezone: a.teamMember.user.timezone,
        priority: a.teamMember.priority,
        isAvailable,
      }
    })
  )

  return {
    booking: {
      id: booking.id,
      uid: booking.uid,
      assignedUserId: booking.assignedUserId,
      schedulingType: booking.eventType.schedulingType,
    },
    availableMembers,
  }
}
