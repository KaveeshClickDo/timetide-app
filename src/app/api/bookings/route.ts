/**
 * /api/bookings
 * GET: List user's bookings (authenticated)
 * POST: Create a new booking (public)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { addMinutes, parseISO, startOfDay } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { createBookingSchema } from '@/lib/validation/schemas';
import { isSlotAvailable, mergeBusyTimes } from '@/lib/slots/calculator';
import { getAllBusyTimes } from '@/lib/calendar/google';
import {
  createGoogleCalendarEvent,
  CreateCalendarEventParams,
  CreateCalendarEventResult,
} from '@/lib/calendar/google';
import { createOutlookCalendarEvent } from '@/lib/calendar/outlook';
import {
  createZoomMeeting,
  hasZoomConnected,
} from '@/lib/zoom';
import { BookingEmailData } from '@/lib/email/client';
import {
  checkBookingRateLimit,
  queueBookingConfirmationEmails,
  queueBookingPendingEmails,
  scheduleBookingReminders,
  triggerBookingCreatedWebhook,
} from '@/lib/queue';

/**
 * GET /api/bookings
 * List bookings for authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const upcoming = searchParams.get('upcoming') === 'true';
    const past = searchParams.get('past') === 'true';

    const where: any = {
      hostId: session.user.id,
    };

    if (status) {
      where.status = status;
    }

    if (upcoming) {
      where.startTime = { gte: new Date() };
      where.status = { in: ['PENDING', 'CONFIRMED'] };
    }

    if (past) {
      where.startTime = { lt: new Date() };
      where.status = { notIn: ['CANCELLED'] }; // Exclude cancelled from past
    }

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        eventType: {
          select: {
            id: true,
            title: true,
            length: true,
            locationType: true,
          },
        },
      },
      orderBy: { startTime: upcoming ? 'asc' : 'desc' },
      take: 50,
    });

    return NextResponse.json({ bookings });
  } catch (error) {
    console.error('GET bookings error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/bookings
 * Create a new booking (public endpoint)
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting (Redis-backed with in-memory fallback)
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const rateLimitResult = await checkBookingRateLimit(ip);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many booking attempts. Please try again later.' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.resetAt.toString(),
          },
        }
      );
    }

    // Parse and validate body
    const body = await request.json();
    const validated = createBookingSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid booking data', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { eventTypeId, startTime, timezone, name, email, phone, notes, responses } =
      validated.data;

    // Fetch event type with team member assignments
    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId, isActive: true },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
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
    });

    if (!eventType) {
      return NextResponse.json(
        { error: 'Event type not found or is not active' },
        { status: 404 }
      );
    }

    const startDate = parseISO(startTime);
    const endDate = addMinutes(startDate, eventType.length);

    // Determine the host based on whether this is a team event
    let selectedHost = {
      id: eventType.userId,
      name: eventType.user.name,
      email: eventType.user.email,
      timezone: eventType.user.timezone,
    };

    // Track assigned user for team events
    let assignedUserId: string | undefined;
    let shouldUpdateRoundRobinState = false;

    // Handle team scheduling
    if (eventType.teamId && eventType.schedulingType && eventType.teamMemberAssignments.length > 0) {
      const assignedMembers = eventType.teamMemberAssignments.map(a => a.teamMember);

      if (eventType.schedulingType === 'ROUND_ROBIN') {
        // Find the next available member using round-robin rotation
        // Start from the member after lastAssignedMemberId
        const lastAssignedIndex = eventType.lastAssignedMemberId
          ? assignedMembers.findIndex(m => m.id === eventType.lastAssignedMemberId)
          : -1;

        let memberIndex = lastAssignedIndex;

        // Try each member in rotation order
        for (let i = 0; i < assignedMembers.length; i++) {
          memberIndex = (memberIndex + 1) % assignedMembers.length;
          const member = assignedMembers[memberIndex];

          // Check if member is available
          let memberBusyTimes: { start: Date; end: Date }[] = [];
          try {
            memberBusyTimes = await getAllBusyTimes(
              member.user.id,
              addMinutes(startDate, -60),
              addMinutes(endDate, 60)
            );
          } catch {
            // Calendar not connected, continue
          }

          const memberBookings = await prisma.booking.findMany({
            where: {
              OR: [
                { hostId: member.user.id },
                { assignedUserId: member.user.id },
              ],
              status: { in: ['PENDING', 'CONFIRMED'] },
              startTime: { lt: endDate },
              endTime: { gt: startDate },
            },
          });

          const memberBusyFromBookings = memberBookings.map(b => ({
            start: b.startTime,
            end: b.endTime,
          }));

          const allMemberBusy = mergeBusyTimes([...memberBusyTimes, ...memberBusyFromBookings]);
          const isAvailable = isSlotAvailable(
            { start: startDate, end: endDate },
            allMemberBusy,
            eventType.bufferTimeBefore,
            eventType.bufferTimeAfter
          );

          if (isAvailable) {
            selectedHost = {
              id: member.user.id,
              name: member.user.name,
              email: member.user.email,
              timezone: member.user.timezone,
            };
            assignedUserId = member.user.id;
            shouldUpdateRoundRobinState = true;
            break;
          }
        }

        if (!assignedUserId) {
          return NextResponse.json(
            { error: 'No team members are available at this time.' },
            { status: 409 }
          );
        }
      } else if (eventType.schedulingType === 'COLLECTIVE') {
        // For collective, all members must be available
        let allAvailable = true;

        for (const member of assignedMembers) {
          let memberBusyTimes: { start: Date; end: Date }[] = [];
          try {
            memberBusyTimes = await getAllBusyTimes(
              member.user.id,
              addMinutes(startDate, -60),
              addMinutes(endDate, 60)
            );
          } catch {
            // Calendar not connected, continue
          }

          const memberBookings = await prisma.booking.findMany({
            where: {
              OR: [
                { hostId: member.user.id },
                { assignedUserId: member.user.id },
              ],
              status: { in: ['PENDING', 'CONFIRMED'] },
              startTime: { lt: endDate },
              endTime: { gt: startDate },
            },
          });

          const memberBusyFromBookings = memberBookings.map(b => ({
            start: b.startTime,
            end: b.endTime,
          }));

          const allMemberBusy = mergeBusyTimes([...memberBusyTimes, ...memberBusyFromBookings]);
          const isAvailable = isSlotAvailable(
            { start: startDate, end: endDate },
            allMemberBusy,
            eventType.bufferTimeBefore,
            eventType.bufferTimeAfter
          );

          if (!isAvailable) {
            allAvailable = false;
            break;
          }
        }

        if (!allAvailable) {
          return NextResponse.json(
            { error: 'This time slot is no longer available for all team members.' },
            { status: 409 }
          );
        }

        // Use the first assigned member as host (all members participate)
        selectedHost = {
          id: assignedMembers[0].user.id,
          name: assignedMembers[0].user.name,
          email: assignedMembers[0].user.email,
          timezone: assignedMembers[0].user.timezone,
        };
        // For collective, the assigned user is effectively all members (host handles it)
      } else if (eventType.schedulingType === 'MANAGED') {
        // For MANAGED: booking is created but assignment happens later by host/admin
        // Use the event type owner as the initial host
        // The booking will need to be assigned to a specific member later
        selectedHost = {
          id: eventType.user.id,
          name: eventType.user.name,
          email: eventType.user.email,
          timezone: eventType.user.timezone,
        };
        // assignedUserId remains undefined - will be set by host/admin later
      }
    }

    // Verify the slot is still available for the selected host
    const calendarBusyTimes = await getAllBusyTimes(
      selectedHost.id,
      addMinutes(startDate, -60),
      addMinutes(endDate, 60)
    );

    // CRITICAL: Check ALL bookings for this host (across all event types) to prevent double booking
    const existingBookings = await prisma.booking.findMany({
      where: {
        hostId: selectedHost.id, // Check all bookings for this host, not just this event type
        status: { in: ['PENDING', 'CONFIRMED'] },
        OR: [
          {
            startTime: { lt: endDate },
            endTime: { gt: startDate },
          },
        ],
      },
    });

    const bookingBusyTimes = existingBookings.map((b) => ({
      start: b.startTime,
      end: b.endTime,
    }));

    const allBusyTimes = mergeBusyTimes([
      ...calendarBusyTimes,
      ...bookingBusyTimes,
    ]);

    const slotAvailable = isSlotAvailable(
      { start: startDate, end: endDate },
      allBusyTimes,
      eventType.bufferTimeBefore,
      eventType.bufferTimeAfter
    );

    if (!slotAvailable) {
      return NextResponse.json(
        { error: 'This time slot is no longer available. Please select another time.' },
        { status: 409 }
      );
    }

    // Check minimum notice
    const minimumNoticeTime = addMinutes(new Date(), eventType.minimumNotice);
    if (startDate < minimumNoticeTime) {
      return NextResponse.json(
        { error: 'This time slot is too soon. Please select a later time.' },
        { status: 400 }
      );
    }

    // Check daily booking limit
    if (eventType.maxBookingsPerDay) {
      const dateKey = startDate.toISOString().split('T')[0];
      const dayStart = startOfDay(startDate);
      const dayEnd = addMinutes(dayStart, 24 * 60);

      const dayBookings = await prisma.booking.count({
        where: {
          eventTypeId,
          status: { in: ['PENDING', 'CONFIRMED'] },
          startTime: { gte: dayStart, lt: dayEnd },
        },
      });

      if (dayBookings >= eventType.maxBookingsPerDay) {
        return NextResponse.json(
          { error: 'No more bookings available for this day.' },
          { status: 409 }
        );
      }
    }

    // Determine location
    let location: string | undefined;
    let meetingUrl: string | undefined;

    switch (eventType.locationType) {
      case 'GOOGLE_MEET':
        location = 'Google Meet';
        // Will be set after calendar event creation
        break;
      case 'TEAMS':
        location = 'Microsoft Teams';
        // Will be set after calendar event creation (via Outlook)
        break;
      case 'ZOOM':
        location = 'Zoom';
        // Will be set after Zoom meeting creation
        break;
      case 'IN_PERSON':
        location = eventType.locationValue ?? 'In Person';
        break;
      case 'PHONE':
        location = `Phone: ${phone ?? 'TBD'}`;
        break;
      case 'CUSTOM':
        location = eventType.locationValue ?? undefined;
        break;
    }

    // Create the booking
    const booking = await prisma.booking.create({
      data: {
        eventTypeId,
        hostId: selectedHost.id,
        assignedUserId: assignedUserId, // For team round-robin assignments
        startTime: startDate,
        endTime: endDate,
        timezone,
        inviteeName: name,
        inviteeEmail: email,
        inviteePhone: phone,
        inviteeNotes: notes,
        responses: responses ?? undefined,
        status: eventType.requiresConfirmation ? 'PENDING' : 'CONFIRMED',
        location,
        source: 'web',
      },
    });

    // Update round-robin state for team events
    if (shouldUpdateRoundRobinState && assignedUserId && eventType.teamId) {
      // Find the team member ID for the assigned user
      const assignedMemberRecord = eventType.teamMemberAssignments.find(
        a => a.teamMember.user.id === assignedUserId
      );
      if (assignedMemberRecord) {
        await prisma.eventType.update({
          where: { id: eventTypeId },
          data: { lastAssignedMemberId: assignedMemberRecord.teamMember.id },
        });
      }
    }

    // Create calendar event
    const primaryCalendar = await prisma.calendar.findFirst({
      where: {
        userId: selectedHost.id,
        isPrimary: true,
        isEnabled: true,
      },
    });

    if (primaryCalendar) {
      const eventParams: CreateCalendarEventParams = {
        calendarId: primaryCalendar.id,
        summary: `${eventType.title} with ${name}`,
        description: `Booked via TimeTide\n\nInvitee: ${name} (${email})\n${notes ? `Notes: ${notes}` : ''}`,
        startTime: startDate,
        endTime: endDate,
        attendees: [
          { email, name },
          { email: selectedHost.email!, name: selectedHost.name ?? undefined },
        ],
        location,
        conferenceData: eventType.locationType === 'GOOGLE_MEET' || eventType.locationType === 'TEAMS',
      };

      let result: CreateCalendarEventResult = { eventId: null, meetLink: null };

      if (primaryCalendar.provider === 'GOOGLE') {
        result = await createGoogleCalendarEvent(eventParams);
      } else if (primaryCalendar.provider === 'OUTLOOK') {
        result = await createOutlookCalendarEvent(eventParams);
      }

      if (result.eventId) {
        // Update booking with calendar event ID and meeting link
        const updatedBooking = await prisma.booking.update({
          where: { id: booking.id },
          data: {
            calendarEventId: result.eventId,
            meetingUrl: result.meetLink || meetingUrl,
          },
        });

        // Update meetingUrl for email
        meetingUrl = updatedBooking.meetingUrl || meetingUrl;
      }
    }

    // Create Zoom meeting if event type is ZOOM
    if (eventType.locationType === 'ZOOM') {
      const hasZoom = await hasZoomConnected(selectedHost.id);

      if (hasZoom) {
        try {
          const zoomMeeting = await createZoomMeeting({
            userId: selectedHost.id,
            topic: `${eventType.title} with ${name}`,
            startTime: startDate,
            duration: eventType.length,
            timezone,
            agenda: notes || `Booked via TimeTide with ${name} (${email})`,
          });

          // Update booking with Zoom meeting URL
          const updatedBooking = await prisma.booking.update({
            where: { id: booking.id },
            data: {
              meetingUrl: zoomMeeting.joinUrl,
            },
          });

          // Update meetingUrl for email
          meetingUrl = updatedBooking.meetingUrl || meetingUrl;

          console.log('Created Zoom meeting for booking:', {
            bookingId: booking.id,
            meetingId: zoomMeeting.meetingId,
            joinUrl: zoomMeeting.joinUrl,
          });
        } catch (error) {
          console.error('Failed to create Zoom meeting:', error);
          // Continue with booking even if Zoom creation fails
        }
      } else {
        console.warn(`Zoom not connected for user ${selectedHost.id}, skipping Zoom meeting creation`);
      }
    }

    // Send confirmation emails
    const emailData: BookingEmailData = {
      hostName: selectedHost.name ?? 'Host',
      hostEmail: selectedHost.email!,
      inviteeName: name,
      inviteeEmail: email,
      eventTitle: eventType.title,
      eventDescription: eventType.description ?? undefined,
      startTime: formatInTimeZone(startDate, timezone, 'EEEE, MMMM d, yyyy h:mm a'),
      endTime: formatInTimeZone(endDate, timezone, 'h:mm a'),
      timezone,
      location,
      meetingUrl: meetingUrl ?? undefined,
      bookingUid: booking.uid,
      notes,
    };

    // Queue emails (with retry support) based on confirmation requirement
    if (eventType.requiresConfirmation) {
      // Queue pending confirmation emails (different template)
      queueBookingPendingEmails(emailData).catch(console.error);
    } else {
      // Queue immediate confirmation emails
      queueBookingConfirmationEmails(emailData).catch(console.error);

      // Schedule reminder emails for confirmed bookings
      scheduleBookingReminders(booking.id, booking.uid, startDate).catch(console.error);
    }

    // Update analytics
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
        bookings: 1,
      },
      update: {
        bookings: { increment: 1 },
      },
    }).catch((err) => { console.warn('Analytics update failed:', err); });

    // Trigger webhook for booking.created
    triggerBookingCreatedWebhook(selectedHost.id, {
      id: booking.id,
      uid: booking.uid,
      status: booking.status,
      startTime: startDate,
      endTime: endDate,
      timezone,
      location,
      meetingUrl,
      inviteeName: name,
      inviteeEmail: email,
      inviteePhone: phone,
      inviteeNotes: notes,
      responses: responses ?? null,
      eventType: {
        id: eventType.id,
        title: eventType.title,
        slug: eventType.slug,
        length: eventType.length,
      },
      host: {
        id: selectedHost.id,
        name: selectedHost.name,
        email: selectedHost.email!,
      },
    }).catch(console.error);

    return NextResponse.json({
      success: true,
      booking: {
        uid: booking.uid,
        status: booking.status,
        startTime: booking.startTime,
        endTime: booking.endTime,
        meetingUrl: booking.meetingUrl,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('POST booking error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
