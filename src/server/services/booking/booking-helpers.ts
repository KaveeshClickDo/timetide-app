/**
 * Shared helper functions for booking route handlers.
 * Extracts repeated patterns from [id]/route.ts and [id]/reschedule/route.ts.
 */

import { formatInTimeZone } from 'date-fns-tz';
import prisma from '@/server/db/prisma';
import { type BookingEmailData } from '@/server/integrations/email/client';
import { deleteAllCalendarEvents } from '@/server/integrations/calendar/event-ids';
import { createNotification, buildBookingNotification } from '@/server/notifications';
import { verifyCode } from '@/server/auth/email-verification';

/**
 * Extract team member names/emails for email notifications.
 * Used when schedulingType is COLLECTIVE and there are active assignments.
 */
export function extractTeamMembersForEmail(
  eventType: {
    schedulingType: string | null;
    teamMemberAssignments: Array<{
      teamMember: { user: { name: string | null; email: string | null } };
    }>;
  }
): Array<{ name: string; email: string }> | undefined {
  if (
    eventType.schedulingType !== 'COLLECTIVE' ||
    eventType.teamMemberAssignments.length === 0
  ) {
    return undefined;
  }

  return eventType.teamMemberAssignments.map(
    (a: { teamMember: { user: { name: string | null; email: string | null } } }) => ({
      name: a.teamMember.user.name ?? 'Team Member',
      email: a.teamMember.user.email!,
    })
  );
}

/**
 * Build BookingEmailData from common booking/host/eventType data.
 * Handles timezone formatting for both invitee and host.
 */
export function buildBookingEmailData(params: {
  booking: {
    startTime: Date;
    endTime: Date;
    timezone: string;
    location: string | null;
    meetingUrl: string | null;
    inviteeName: string;
    inviteeEmail: string;
    uid: string;
  };
  host: {
    name: string | null;
    email: string | null;
    username?: string | null;
    timezone?: string | null;
  };
  eventType: {
    title: string;
    slug: string;
    description?: string | null;
  };
  teamMembers?: Array<{ name: string; email: string }>;
  /** Override formatted time strings (for bulk operations) */
  overrides?: {
    startTime?: string;
    endTime?: string;
    hostStartTime?: string;
    hostEndTime?: string;
  };
}): BookingEmailData {
  const { booking, host, eventType, teamMembers, overrides } = params;
  const hostTimezone = host.timezone || booking.timezone;

  return {
    hostName: host.name ?? 'Host',
    hostEmail: host.email!,
    hostUsername: host.username ?? undefined,
    inviteeName: booking.inviteeName,
    inviteeEmail: booking.inviteeEmail,
    eventTitle: eventType.title,
    eventSlug: eventType.slug,
    eventDescription: eventType.description ?? undefined,
    startTime:
      overrides?.startTime ??
      formatInTimeZone(booking.startTime, booking.timezone, 'EEEE, MMMM d, yyyy h:mm a'),
    endTime:
      overrides?.endTime ??
      formatInTimeZone(booking.endTime, booking.timezone, 'h:mm a'),
    timezone: booking.timezone,
    hostStartTime:
      overrides?.hostStartTime ??
      formatInTimeZone(booking.startTime, hostTimezone, 'EEEE, MMMM d, yyyy h:mm a'),
    hostEndTime:
      overrides?.hostEndTime ??
      formatInTimeZone(booking.endTime, hostTimezone, 'h:mm a'),
    hostTimezone: hostTimezone,
    location: booking.location ?? undefined,
    meetingUrl: booking.meetingUrl ?? undefined,
    bookingUid: booking.uid,
    teamMembers,
  };
}

/**
 * Build the webhook booking payload object.
 * Used for all webhook triggers (created, confirmed, rejected, cancelled, rescheduled).
 */
export function buildWebhookBookingPayload(params: {
  booking: {
    id: string;
    uid: string;
    status: string;
    startTime: Date;
    endTime: Date;
    timezone: string;
    location: string | null;
    meetingUrl: string | null;
    inviteeName: string;
    inviteeEmail: string;
    inviteePhone: string | null;
    inviteeNotes: string | null;
    responses: Record<string, unknown> | null;
    eventTypeId: string;
  };
  eventType: {
    id?: string;
    title: string;
    slug: string;
    length: number;
  };
  host: {
    id: string;
    name: string | null;
    email: string | null;
  };
  statusOverride?: string;
}): {
  id: string;
  uid: string;
  status: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  location: string | null;
  meetingUrl: string | null;
  inviteeName: string;
  inviteeEmail: string;
  inviteePhone: string | null;
  inviteeNotes: string | null;
  responses: Record<string, unknown> | null;
  eventType: { id: string; title: string; slug: string; length: number };
  host: { id: string; name: string | null; email: string };
} {
  const { booking, eventType, host, statusOverride } = params;

  return {
    id: booking.id,
    uid: booking.uid,
    status: statusOverride || booking.status,
    startTime: booking.startTime,
    endTime: booking.endTime,
    timezone: booking.timezone,
    location: booking.location,
    meetingUrl: booking.meetingUrl,
    inviteeName: booking.inviteeName,
    inviteeEmail: booking.inviteeEmail,
    inviteePhone: booking.inviteePhone,
    inviteeNotes: booking.inviteeNotes,
    responses: booking.responses,
    eventType: {
      id: eventType.id || booking.eventTypeId,
      title: eventType.title,
      slug: eventType.slug,
      length: eventType.length,
    },
    host: {
      id: host.id,
      name: host.name,
      email: host.email!,
    },
  };
}

/**
 * Delete calendar events from the booking organizer's calendars AND
 * from collective team members' calendars (BookingAttendee records).
 */
export async function cleanupBookingCalendarEvents(params: {
  bookingId: string;
  hostId: string;
  calendarEventId: string | null;
  calendarEventIds: unknown;
  meetingOrganizerUserId?: string | null;
  sync?: boolean;
}): Promise<void> {
  const {
    bookingId,
    hostId,
    calendarEventId,
    calendarEventIds,
    meetingOrganizerUserId,
    sync,
  } = params;

  // 1. Delete from organizer (meetingOrganizerUserId || hostId)
  const calendarOwnerId = meetingOrganizerUserId || hostId;
  await deleteAllCalendarEvents(calendarOwnerId, calendarEventId, calendarEventIds, {
    sync,
  });

  // 2. Find BookingAttendee records with userId != null for this bookingId
  const attendees = await prisma.bookingAttendee.findMany({
    where: { bookingId, userId: { not: null } },
  });

  // 3. For each attendee with calendarEventIds, delete their events too (fire-and-forget)
  for (const att of attendees) {
    if (att.userId && att.calendarEventIds) {
      deleteAllCalendarEvents(att.userId, null, att.calendarEventIds).catch(
        console.error
      );
    }
  }
}

/**
 * Send an in-app notification for a booking action.
 * Fire-and-forget with .catch(console.error).
 */
export function sendBookingInAppNotification(params: {
  type:
    | 'BOOKING_CANCELLED'
    | 'BOOKING_CONFIRMED'
    | 'BOOKING_REJECTED'
    | 'BOOKING_RESCHEDULED';
  hostId: string;
  bookingId: string;
  inviteeName: string;
  eventTitle: string;
  startTimeDisplay: string;
  isHost: boolean;
}): void {
  const { type, hostId, bookingId, inviteeName, eventTitle, startTimeDisplay, isHost } =
    params;

  // Only send if the actor is NOT the host (don't notify host about their own action)
  if (isHost) return;

  const notif = buildBookingNotification(type, {
    inviteeName,
    eventTitle,
    startTime: startTimeDisplay,
  });

  createNotification({
    userId: hostId,
    type,
    ...notif,
    bookingId,
  }).catch(console.error);
}

/**
 * Check if a user is authorized to access/modify a booking.
 * Handles host, assigned member, team member, and invitee (via UID + email verification).
 */
export function authorizeBookingAccess(params: {
  sessionUserId: string | undefined;
  booking: {
    hostId: string;
    assignedUserId: string | null;
    uid: string;
    inviteeEmail: string;
    eventType: {
      teamMemberAssignments?: Array<{
        teamMember: { userId: string };
      }>;
    };
  };
  accessId: string;
  emailVerification?: {
    code: string;
    signature: string;
    expiresAt: number;
  };
  purpose?: string;
}): { authorized: boolean; isHost: boolean; error?: string; status?: number } {
  const { sessionUserId, booking, accessId, emailVerification, purpose } = params;

  const isHost = sessionUserId === booking.hostId;
  const isAssignedMember = sessionUserId === booking.assignedUserId;
  const isTeamMember = booking.eventType.teamMemberAssignments?.some(
    (a: { teamMember: { userId: string } }) => a.teamMember.userId === sessionUserId
  );

  // Authenticated host, assigned member, or team member -> authorized
  if (isHost || isAssignedMember || isTeamMember) {
    return { authorized: true, isHost };
  }

  // Accessed by UID -> verify email code
  const accessedByUid = accessId === booking.uid;
  if (accessedByUid) {
    if (
      !emailVerification?.code ||
      !emailVerification?.signature ||
      !emailVerification?.expiresAt
    ) {
      return {
        authorized: false,
        isHost: false,
        error: `Email verification is required to ${purpose || 'manage'} this booking`,
        status: 403,
      };
    }

    const result = verifyCode(
      booking.inviteeEmail,
      emailVerification.code,
      'BOOKING_MANAGE',
      emailVerification.signature,
      emailVerification.expiresAt
    );

    if (!result.valid) {
      return {
        authorized: false,
        isHost: false,
        error: result.error || 'Email verification failed',
        status: 403,
      };
    }

    return { authorized: true, isHost: false };
  }

  // Otherwise -> unauthorized
  return {
    authorized: false,
    isHost: false,
    error: 'Unauthorized',
    status: 403,
  };
}
