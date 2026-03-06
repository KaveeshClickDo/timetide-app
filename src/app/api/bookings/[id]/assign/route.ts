/**
 * /api/bookings/[id]/assign
 * POST: Assign a team member to a booking (for MANAGED scheduling type)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { formatInTimeZone } from 'date-fns-tz';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';
import { queueBookingConfirmationEmails, scheduleBookingReminders } from '@/lib/infrastructure/queue';
import { BookingEmailData } from '@/lib/integrations/email/client';
import {
  createGoogleCalendarEvent,
  CreateCalendarEventParams,
  CreateCalendarEventResult,
} from '@/lib/integrations/calendar/google';
import { createOutlookCalendarEvent } from '@/lib/integrations/calendar/outlook';
import { createZoomMeeting, hasZoomConnected } from '@/lib/integrations/zoom';
import { buildCalendarEventIdsUpdate, type CalendarEventIds } from '@/lib/integrations/calendar/event-ids';

const assignMemberSchema = z.object({
  assignedUserId: z.string().min(1, 'Member ID is required'),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/bookings/[id]/assign
 * Assign a team member to a booking
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate body
    const body = await request.json();
    const validated = assignMemberSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { assignedUserId } = validated.data;

    // Find the booking
    const booking = await prisma.booking.findFirst({
      where: {
        OR: [{ id }, { uid: id }],
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      include: {
        eventType: {
          include: {
            team: {
              include: {
                members: {
                  where: {
                    userId: session.user.id,
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
    });

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found or cannot be modified' },
        { status: 404 }
      );
    }

    // Check authorization - must be team admin/owner or host
    const isTeamAdmin =
      booking.eventType.team?.members && booking.eventType.team.members.length > 0;
    const isHost = booking.hostId === session.user.id;

    if (!isTeamAdmin && !isHost) {
      return NextResponse.json(
        { error: 'Only team admins or the host can assign members' },
        { status: 403 }
      );
    }

    // Verify this is a MANAGED scheduling type event
    if (booking.eventType.schedulingType !== 'MANAGED') {
      return NextResponse.json(
        { error: 'Member assignment is only available for MANAGED scheduling type' },
        { status: 400 }
      );
    }

    // Verify the assigned user is an active team member for this event
    const assignedMember = booking.eventType.teamMemberAssignments.find(
      (a) => a.teamMember.user.id === assignedUserId
    );

    if (!assignedMember) {
      return NextResponse.json(
        { error: 'Assigned user is not an active team member for this event type' },
        { status: 400 }
      );
    }

    // Update the booking with the assigned member
    const updatedBooking = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        assignedUserId,
        // If booking was pending and we're assigning, auto-confirm it
        status: booking.status === 'PENDING' ? 'CONFIRMED' : booking.status,
      },
    });

    // Create calendar event and meeting link for the assigned member
    const assignedUser = assignedMember.teamMember.user;
    let assignedMeetingUrl = booking.meetingUrl;

    try {
      // Create Zoom meeting first if needed (so we have the URL for calendar events)
      if (booking.eventType.locationType === 'ZOOM' && !booking.meetingUrl) {
        const hasZoom = await hasZoomConnected(assignedUserId);
        if (hasZoom) {
          const zoomMeeting = await createZoomMeeting({
            userId: assignedUserId,
            topic: `${booking.eventType.title} with ${booking.inviteeName}`,
            startTime: booking.startTime,
            duration: booking.eventType.length,
            timezone: booking.timezone,
            agenda: `Booked via TimeTide with ${booking.inviteeName} (${booking.inviteeEmail})`,
          });

          await prisma.booking.update({
            where: { id: booking.id },
            data: { meetingUrl: zoomMeeting.joinUrl },
          });
          assignedMeetingUrl = zoomMeeting.joinUrl;
        }
      }

      // Find ALL enabled calendars for the assigned member
      const allCalendars = await prisma.calendar.findMany({
        where: { userId: assignedUserId, isEnabled: true },
      });

      if (allCalendars.length > 0) {
        const locationType = booking.eventType.locationType;

        // Determine which calendar generates the meeting link
        let meetingLinkProvider: string | null = null;
        if (locationType === 'GOOGLE_MEET') meetingLinkProvider = 'GOOGLE';
        else if (locationType === 'TEAMS') meetingLinkProvider = 'OUTLOOK';

        // Sort so meeting-link calendar processes first
        const sortedCalendars = [...allCalendars].sort((a, b) => {
          if (a.provider === meetingLinkProvider) return -1;
          if (b.provider === meetingLinkProvider) return 1;
          return 0;
        });

        const calendarEventIds: CalendarEventIds = {};
        let currentMeetLink = assignedMeetingUrl;

        for (const cal of sortedCalendars) {
          const isMeetingLinkCalendar = cal.provider === meetingLinkProvider;
          const needsConferenceData = isMeetingLinkCalendar && !currentMeetLink;

          const meetingInfo = currentMeetLink ? `\nMeeting: ${currentMeetLink}` : '';
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
          };

          let result: CreateCalendarEventResult = { eventId: null, meetLink: null };

          try {
            if (cal.provider === 'GOOGLE') {
              result = await createGoogleCalendarEvent(eventParams);
            } else if (cal.provider === 'OUTLOOK') {
              result = await createOutlookCalendarEvent(eventParams);
            }
          } catch (calError) {
            console.error(`Failed to create ${cal.provider} calendar event:`, calError);
            continue;
          }

          if (result.eventId) {
            calendarEventIds[cal.provider as 'GOOGLE' | 'OUTLOOK'] = result.eventId;
          }

          if (result.meetLink && !currentMeetLink) {
            currentMeetLink = result.meetLink;
            assignedMeetingUrl = result.meetLink;
          }
        }

        // Update booking with all calendar event IDs and meeting URL
        const updateData: Record<string, unknown> = {
          ...buildCalendarEventIdsUpdate(calendarEventIds),
        };
        if (assignedMeetingUrl && !booking.meetingUrl) {
          updateData.meetingUrl = assignedMeetingUrl;
        }

        await prisma.booking.update({
          where: { id: booking.id },
          data: updateData,
        });
      }
    } catch (error) {
      console.error('Failed to create calendar event for assigned member:', error);
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
        startTime: formatInTimeZone(
          booking.startTime,
          booking.timezone,
          'EEEE, MMMM d, yyyy h:mm a'
        ),
        endTime: formatInTimeZone(booking.endTime, booking.timezone, 'h:mm a'),
        timezone: booking.timezone,
        location: booking.location ?? undefined,
        meetingUrl: assignedMeetingUrl ?? undefined,
        bookingUid: booking.uid,
      };

      // Queue confirmation emails
      queueBookingConfirmationEmails(emailData).catch(console.error);

      // Schedule reminders
      scheduleBookingReminders(booking.id, booking.uid, booking.startTime).catch(
        console.error
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Team member assigned successfully',
      booking: {
        id: updatedBooking.id,
        uid: updatedBooking.uid,
        assignedUserId: updatedBooking.assignedUserId,
        assignedMemberName: assignedMember.teamMember.user.name,
        status: updatedBooking.status,
      },
    });
  } catch (error) {
    console.error('POST assign member error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/bookings/[id]/assign
 * Get available team members for assignment
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find the booking
    const booking = await prisma.booking.findFirst({
      where: {
        OR: [{ id }, { uid: id }],
      },
      include: {
        eventType: {
          include: {
            team: {
              include: {
                members: {
                  where: {
                    userId: session.user.id,
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
    });

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Check authorization
    const isTeamAdmin =
      booking.eventType.team?.members && booking.eventType.team.members.length > 0;
    const isHost = booking.hostId === session.user.id;

    if (!isTeamAdmin && !isHost) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get available members (filter for active members)
    const availableMembers = booking.eventType.teamMemberAssignments
      .filter((a) => a.teamMember.isActive)
      .map((a) => ({
        id: a.teamMember.user.id,
        teamMemberId: a.teamMember.id,
        name: a.teamMember.user.name,
        email: a.teamMember.user.email,
        image: a.teamMember.user.image,
        timezone: a.teamMember.user.timezone,
        priority: a.teamMember.priority,
      }));

    return NextResponse.json({
      booking: {
        id: booking.id,
        uid: booking.uid,
        assignedUserId: booking.assignedUserId,
        schedulingType: booking.eventType.schedulingType,
      },
      availableMembers,
    });
  } catch (error) {
    console.error('GET available members error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
