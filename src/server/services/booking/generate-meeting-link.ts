/**
 * Meeting link generation on booking confirmation.
 * Extracted from PATCH confirm flow in [id]/route.ts.
 *
 * Handles creating Zoom meetings or re-creating calendar events with
 * conferenceData (Google Meet / Teams) when a pending booking is confirmed.
 */

import prisma from '@/server/db/prisma';
import {
  deleteGoogleCalendarEvent,
  createGoogleCalendarEvent,
  type CreateCalendarEventResult,
} from '@/server/integrations/calendar/google';
import {
  deleteOutlookCalendarEvent,
  createOutlookCalendarEvent,
} from '@/server/integrations/calendar/outlook';
import {
  parseCalendarEventIds,
  buildCalendarEventIdsUpdate,
} from '@/server/integrations/calendar/event-ids';
import { createZoomMeeting, hasZoomConnected } from '@/server/integrations/zoom';

/**
 * Generate a meeting link when a pending booking is confirmed.
 *
 * For Zoom: creates a new Zoom meeting via the API.
 * For Google Meet / Teams: deletes old calendar events (created without
 * conferenceData during pending state) and re-creates them with conferenceData
 * enabled so the calendar provider generates a meeting link.
 *
 * Also updates the booking record in the database with the new meetingUrl
 * and calendarEventIds.
 *
 * @returns The generated meeting URL, or null if no link was generated.
 */
export async function generateMeetingLinkOnConfirm(params: {
  booking: {
    id: string;
    startTime: Date;
    endTime: Date;
    timezone: string;
    calendarEventId: string | null;
    calendarEventIds: unknown;
    inviteeName: string;
    inviteeEmail: string;
    location: string | null;
    meetingUrl: string | null;
    eventTypeId: string;
  };
  eventType: {
    title: string;
    length: number;
    locationType: string | null;
    meetingOrganizerUserId: string | null;
  };
  host: {
    id: string;
    timezone: string | null;
  };
}): Promise<string | null> {
  const { booking, eventType, host } = params;
  const meetingAccountUserId = eventType.meetingOrganizerUserId || host.id;
  const locationType = eventType.locationType;
  let generatedMeetingUrl: string | null = null;

  if (locationType === 'ZOOM') {
    const hasZoom = await hasZoomConnected(meetingAccountUserId);
    if (hasZoom) {
      const zoomMeeting = await createZoomMeeting({
        userId: meetingAccountUserId,
        topic: `${eventType.title} with ${booking.inviteeName}`,
        startTime: booking.startTime,
        duration: eventType.length,
        timezone: host.timezone || booking.timezone,
        agenda: `Booked via TimeTide with ${booking.inviteeName} (${booking.inviteeEmail})`,
      });
      generatedMeetingUrl = zoomMeeting.joinUrl;
    }
  } else if (locationType === 'GOOGLE_MEET' || locationType === 'TEAMS') {
    // Delete old calendar events (without conferenceData) and re-create with meeting link
    const ids = parseCalendarEventIds(booking.calendarEventId, booking.calendarEventIds);
    const calendars = await prisma.calendar.findMany({
      where: { userId: meetingAccountUserId, isEnabled: true },
    });

    const targetProvider = locationType === 'GOOGLE_MEET' ? 'GOOGLE' : 'OUTLOOK';

    // Sort so meeting-link calendar processes first
    const sortedCals = [...calendars].sort((a, b) => {
      if (a.provider === targetProvider) return -1;
      if (b.provider === targetProvider) return 1;
      return 0;
    });

    const newCalendarEventIds: Record<string, string> = {};

    for (const cal of sortedCals) {
      const oldEventId = ids[cal.provider as 'GOOGLE' | 'OUTLOOK'];

      // Delete old event (if exists)
      if (oldEventId) {
        try {
          if (cal.provider === 'GOOGLE')
            await deleteGoogleCalendarEvent(cal.id, oldEventId);
          else if (cal.provider === 'OUTLOOK')
            await deleteOutlookCalendarEvent(cal.id, oldEventId);
        } catch {
          /* ignore deletion errors */
        }
      }

      // Re-create with conferenceData on the meeting-link calendar
      const isMeetingLinkCal = cal.provider === targetProvider;
      const meetingInfo = generatedMeetingUrl
        ? `\nMeeting: ${generatedMeetingUrl}`
        : '';
      let result: CreateCalendarEventResult = { eventId: null, meetLink: null };

      try {
        if (cal.provider === 'GOOGLE') {
          result = await createGoogleCalendarEvent({
            calendarId: cal.id,
            summary: `${eventType.title} with ${booking.inviteeName}`,
            description: `Booked via TimeTide\n\nInvitee: ${booking.inviteeName} (${booking.inviteeEmail})${meetingInfo}`,
            startTime: booking.startTime,
            endTime: booking.endTime,
            attendees: [
              { email: booking.inviteeEmail, name: booking.inviteeName },
            ],
            location: generatedMeetingUrl || booking.location || undefined,
            conferenceData: isMeetingLinkCal,
          });
        } else if (cal.provider === 'OUTLOOK') {
          result = await createOutlookCalendarEvent({
            calendarId: cal.id,
            summary: `${eventType.title} with ${booking.inviteeName}`,
            description: `Booked via TimeTide\n\nInvitee: ${booking.inviteeName} (${booking.inviteeEmail})${meetingInfo}`,
            startTime: booking.startTime,
            endTime: booking.endTime,
            attendees: [
              { email: booking.inviteeEmail, name: booking.inviteeName },
            ],
            location: generatedMeetingUrl || booking.location || undefined,
            conferenceData: isMeetingLinkCal,
          });
        }
      } catch (calError) {
        console.error(
          `Failed to re-create ${cal.provider} calendar event on confirm:`,
          calError
        );
        continue;
      }

      if (result.eventId) {
        newCalendarEventIds[cal.provider] = result.eventId;
      }
      if (result.meetLink && !generatedMeetingUrl) {
        generatedMeetingUrl = result.meetLink;
      }
    }

    // Update calendar event IDs
    if (Object.keys(newCalendarEventIds).length > 0) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: buildCalendarEventIdsUpdate(
          newCalendarEventIds as Record<'GOOGLE' | 'OUTLOOK', string>
        ),
      });
    }
  }

  if (generatedMeetingUrl) {
    await prisma.booking.update({
      where: { id: booking.id },
      data: { meetingUrl: generatedMeetingUrl },
    });
  }

  return generatedMeetingUrl;
}
