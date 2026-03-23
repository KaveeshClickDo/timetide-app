/**
 * Calendar event creation for bookings.
 *
 * Creates events on all connected calendar providers (Google, Outlook),
 * handles Zoom meeting creation, and syncs events to collective team members.
 * Returns updated booking data with meeting URLs and a flag if meeting link failed.
 */

import prisma from '@/server/db/prisma'
import {
  createGoogleCalendarEvent,
  type CreateCalendarEventParams,
  type CreateCalendarEventResult,
} from '@/server/integrations/calendar/google'
import { createOutlookCalendarEvent } from '@/server/integrations/calendar/outlook'
import { buildCalendarEventIdsUpdate, type CalendarEventIds } from '@/server/integrations/calendar/event-ids'
import { createZoomMeeting, hasZoomConnected } from '@/server/integrations/zoom'
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
    id: string
    user: {
      id: string
      name: string | null
      email: string | null
    }
  }
}

/**
 * Create calendar events for all bookings on all connected providers.
 *
 * Mutates `createdBookings[].meetingUrl` in place with the generated meeting URLs.
 * Also creates Zoom meetings where applicable.
 */
export async function createCalendarEvents(params: {
  createdBookings: BookingRecord[]
  selectedHost: HostInfo
  meetingOrganizerUserId: string | null
  eventTitle: string
  eventLength: number
  locationType: string | null
  bookingStatus: string
  inviteeName: string
  inviteeEmail: string
  notes: string | null | undefined
  location: string | undefined
  isRecurring: boolean
  occurrenceCount: number
  schedulingType: string | null
  teamMemberAssignments: TeamMemberAssignment[]
}): Promise<void> {
  const {
    createdBookings,
    selectedHost,
    meetingOrganizerUserId,
    eventTitle,
    eventLength,
    locationType,
    bookingStatus,
    inviteeName,
    inviteeEmail,
    notes,
    location,
    isRecurring,
    occurrenceCount,
    schedulingType,
    teamMemberAssignments,
  } = params

  const hostTimezone = selectedHost.timezone || 'UTC'
  const meetingAccountUserId = meetingOrganizerUserId || selectedHost.id

  // Fetch ALL enabled calendars for the meeting account
  const allCalendars = await prisma.calendar.findMany({
    where: { userId: meetingAccountUserId, isEnabled: true },
  })

  // Determine which calendar generates the meeting link
  let meetingLinkCalendarId: string | null = null
  if (locationType === 'GOOGLE_MEET') {
    const googleCal = allCalendars.find(c => c.provider === 'GOOGLE')
    if (googleCal) meetingLinkCalendarId = googleCal.id
  } else if (locationType === 'TEAMS') {
    const outlookCal = allCalendars.find(c => c.provider === 'OUTLOOK')
    if (outlookCal) meetingLinkCalendarId = outlookCal.id
  }

  // Build attendees list based on scheduling type
  const calendarAttendees: Array<{ email: string; name?: string }> = [
    { email: inviteeEmail, name: inviteeName },
  ]
  if (schedulingType === 'COLLECTIVE' && teamMemberAssignments.length > 0) {
    for (const assignment of teamMemberAssignments) {
      const memberEmail = assignment.teamMember.user.email
      if (memberEmail) {
        calendarAttendees.push({ email: memberEmail, name: assignment.teamMember.user.name ?? undefined })
      }
    }
  } else {
    calendarAttendees.push({ email: selectedHost.email!, name: selectedHost.name ?? undefined })
  }

  // Sort so meeting-link calendar is processed first
  const sortedCalendars = [...allCalendars].sort((a, b) => {
    const aIsMeetingLink = a.id === meetingLinkCalendarId ? 0 : 1
    const bIsMeetingLink = b.id === meetingLinkCalendarId ? 0 : 1
    return aIsMeetingLink - bIsMeetingLink
  })


  // ─── Host calendar events ──────────────────────────────────────────────────

  for (const booking of createdBookings) {
    const calendarEventIds: CalendarEventIds = {}
    let meetingUrl: string | null = null

    for (const cal of sortedCalendars) {
      try {
        const occSuffix = isRecurring ? ` (${createdBookings.indexOf(booking) + 1}/${occurrenceCount})` : ''
        const needsConference = cal.id === meetingLinkCalendarId && bookingStatus !== 'PENDING'
        const eventParams: CreateCalendarEventParams = {
          calendarId: cal.id,
          summary: `${eventTitle} with ${inviteeName}${occSuffix}`,
          description: `Booked via TimeTide\n\nInvitee: ${inviteeName} (${inviteeEmail})\n${notes ? `Notes: ${notes}` : ''}${isRecurring ? `\nRecurring: Week ${createdBookings.indexOf(booking) + 1} of ${occurrenceCount}` : ''}`,
          startTime: booking.startTime,
          endTime: booking.endTime,
          attendees: calendarAttendees,
          location: meetingUrl || location,
          conferenceData: needsConference,
        }

        let result: CreateCalendarEventResult = { eventId: null, meetLink: null }
        if (cal.provider === 'GOOGLE') {
          result = await createGoogleCalendarEvent(eventParams)
        } else if (cal.provider === 'OUTLOOK') {
          result = await createOutlookCalendarEvent(eventParams)
        }

        if (result.eventId) {
          calendarEventIds[cal.provider as 'GOOGLE' | 'OUTLOOK'] = result.eventId
        }
        if (result.meetLink && needsConference) {
          meetingUrl = result.meetLink
        }
      } catch (error) {
        console.error(`Failed to create ${cal.provider} calendar event for booking ${booking.id}:`, error)
        // If the meeting-link calendar failed, propagate so the caller can compensate
        if (cal.id === meetingLinkCalendarId && bookingStatus !== 'PENDING') {
          throw error
        }
      }
    }

    // Update booking with calendar event IDs and meeting URL
    if (Object.keys(calendarEventIds).length > 0 || meetingUrl) {
      const updateData: Record<string, unknown> = {}
      if (Object.keys(calendarEventIds).length > 0) {
        const idsUpdate = buildCalendarEventIdsUpdate(calendarEventIds)
        updateData.calendarEventId = idsUpdate.calendarEventId
        updateData.calendarEventIds = idsUpdate.calendarEventIds
      }
      if (meetingUrl) {
        updateData.meetingUrl = meetingUrl
      }
      await prisma.booking.update({
        where: { id: booking.id },
        data: updateData,
      })
      booking.meetingUrl = meetingUrl || null
    }

    // Create Zoom meeting if needed
    if (locationType === 'ZOOM' && bookingStatus !== 'PENDING') {
      try {
        const hasZoom = await hasZoomConnected(meetingAccountUserId)
        if (hasZoom) {
          const zoomMeeting = await createZoomMeeting({
            userId: meetingAccountUserId,
            topic: `${eventTitle} with ${inviteeName}`,
            startTime: booking.startTime,
            duration: eventLength,
            timezone: hostTimezone,
            agenda: notes || `Booked via TimeTide with ${inviteeName} (${inviteeEmail})`,
          })

          await prisma.booking.update({
            where: { id: booking.id },
            data: { meetingUrl: zoomMeeting.joinUrl },
          })
          booking.meetingUrl = zoomMeeting.joinUrl
        }
      } catch (error) {
        console.error(`Failed to create Zoom meeting for booking ${booking.id}:`, error)
        // Propagate so the caller can compensate — confirmed booking needs a meeting link
        throw error
      }
    }

  }

  // ─── Collective members' calendar events ───────────────────────────────────

  if (schedulingType === 'COLLECTIVE' && teamMemberAssignments.length > 0) {
    const nonHostMembers = teamMemberAssignments.filter(
      a => a.teamMember.user.id !== meetingAccountUserId
    )

    for (const member of nonHostMembers) {
      const memberCalendars = await prisma.calendar.findMany({
        where: { userId: member.teamMember.user.id, isEnabled: true },
      })
      if (memberCalendars.length === 0) continue

      for (const booking of createdBookings) {
        const memberCalEventIds: CalendarEventIds = {}
        const occSuffix = isRecurring ? ` (${createdBookings.indexOf(booking) + 1}/${occurrenceCount})` : ''

        for (const cal of memberCalendars) {
          try {
            const eventParams: CreateCalendarEventParams = {
              calendarId: cal.id,
              summary: `${eventTitle} with ${inviteeName}${occSuffix}`,
              description: `Booked via TimeTide\n\nInvitee: ${inviteeName} (${inviteeEmail})\n${notes ? `Notes: ${notes}` : ''}`,
              startTime: booking.startTime,
              endTime: booking.endTime,
              attendees: calendarAttendees,
              location: booking.meetingUrl || location,
              conferenceData: false,
            }

            let result: CreateCalendarEventResult = { eventId: null, meetLink: null }
            if (cal.provider === 'GOOGLE') {
              result = await createGoogleCalendarEvent(eventParams)
            } else if (cal.provider === 'OUTLOOK') {
              result = await createOutlookCalendarEvent(eventParams)
            }
            if (result.eventId) {
              memberCalEventIds[cal.provider as 'GOOGLE' | 'OUTLOOK'] = result.eventId
            }
          } catch (error) {
            console.error(`Failed to create ${cal.provider} calendar event for member ${member.teamMember.user.id}:`, error)
          }
        }

        if (Object.keys(memberCalEventIds).length > 0) {
          await prisma.bookingAttendee.updateMany({
            where: {
              bookingId: booking.id,
              userId: member.teamMember.user.id,
            },
            data: {
              calendarEventIds: memberCalEventIds,
            },
          })
        }
      }
    }
  }

}
