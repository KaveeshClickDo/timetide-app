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
import {
  sendBookingConfirmationEmails,
  BookingEmailData,
} from '@/lib/email/client';

// Rate limiting for booking creation
const bookingRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const BOOKING_RATE_LIMIT = 5; // bookings per minute per IP
const BOOKING_RATE_WINDOW = 60 * 1000;

function checkBookingRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = bookingRateLimitMap.get(ip);

  if (!record || now > record.resetAt) {
    bookingRateLimitMap.set(ip, { count: 1, resetAt: now + BOOKING_RATE_WINDOW });
    return true;
  }

  if (record.count >= BOOKING_RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

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
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    if (!checkBookingRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many booking attempts. Please try again later.' },
        { status: 429 }
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

    // Fetch event type
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

    // Verify the slot is still available
    const calendarBusyTimes = await getAllBusyTimes(
      eventType.userId,
      addMinutes(startDate, -60),
      addMinutes(endDate, 60)
    );

    // CRITICAL: Check ALL bookings for this host (across all event types) to prevent double booking
    const existingBookings = await prisma.booking.findMany({
      where: {
        hostId: eventType.userId, // Check all bookings for this host, not just this event type
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
        hostId: eventType.userId,
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

    // Create calendar event
    const primaryCalendar = await prisma.calendar.findFirst({
      where: {
        userId: eventType.userId,
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
          { email: eventType.user.email!, name: eventType.user.name ?? undefined },
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
      const hasZoom = await hasZoomConnected(eventType.userId);

      if (hasZoom) {
        try {
          const zoomMeeting = await createZoomMeeting({
            userId: eventType.userId,
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
        console.warn(`Zoom not connected for user ${eventType.userId}, skipping Zoom meeting creation`);
      }
    }

    // Send confirmation emails
    const emailData: BookingEmailData = {
      hostName: eventType.user.name ?? 'Host',
      hostEmail: eventType.user.email!,
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

    // Send emails asynchronously
    sendBookingConfirmationEmails(emailData).catch(console.error);

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
    }).catch(() => {});

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
