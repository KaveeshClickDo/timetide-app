/**
 * /api/bookings/[id]/reschedule
 * POST: Reschedule a booking to a new time
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { formatInTimeZone } from 'date-fns-tz';
import { addMinutes } from 'date-fns';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { rescheduleBookingSchema } from '@/lib/validation/schemas';
import { updateGoogleCalendarEvent } from '@/lib/calendar/google';
import { updateOutlookCalendarEvent } from '@/lib/calendar/outlook';
import { BookingEmailData } from '@/lib/email/client';
import {
  queueBookingRescheduledEmails,
  rescheduleBookingReminders,
  triggerBookingRescheduledWebhook,
} from '@/lib/queue';
import { createNotification, buildBookingNotification } from '@/lib/notifications';

interface RouteParams {
  params: { id: string };
}

/**
 * POST /api/bookings/[id]/reschedule
 * Reschedule a booking to a new time
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;
    const session = await getServerSession(authOptions);

    // Parse and validate body
    const body = await request.json();
    const validated = rescheduleBookingSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { newStartTime, reason, scope } = validated.data;
    const newStart = new Date(newStartTime);

    // Find the booking
    const booking = await prisma.booking.findFirst({
      where: {
        OR: [{ id }, { uid: id }],
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      include: {
        eventType: {
          select: {
            id: true,
            title: true,
            slug: true,
            description: true,
            length: true,
          },
        },
        host: {
          select: {
            id: true,
            name: true,
            email: true,
            timezone: true,
          },
        },
      },
    });

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found or cannot be rescheduled' },
        { status: 404 }
      );
    }

    // Check authorization - host can always reschedule, invitee via UID
    const isHost = session?.user?.id === booking.hostId;
    const accessedByUid = id === booking.uid;

    if (!isHost && !accessedByUid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Validate new time is in the future
    if (newStart <= new Date()) {
      return NextResponse.json(
        { error: 'New time must be in the future' },
        { status: 400 }
      );
    }

    // Calculate new end time based on event duration
    const newEnd = addMinutes(newStart, booking.eventType.length);
    const deltaMs = newStart.getTime() - booking.startTime.getTime();

    // ── Bulk scope: reschedule this and all future occurrences ──
    if (scope === 'this_and_future' && booking.recurringGroupId) {
      // Find all future bookings in the series (including this one)
      const futureBookings = await prisma.booking.findMany({
        where: {
          recurringGroupId: booking.recurringGroupId,
          startTime: { gte: booking.startTime },
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
        orderBy: { startTime: 'asc' },
      });

      // Validate ALL shifted times for conflicts first (all-or-nothing)
      for (const fb of futureBookings) {
        const shiftedStart = new Date(fb.startTime.getTime() + deltaMs);
        const shiftedEnd = addMinutes(shiftedStart, booking.eventType.length);

        const conflict = await prisma.booking.findFirst({
          where: {
            hostId: booking.hostId,
            id: { notIn: futureBookings.map(b => b.id) },
            status: { in: ['PENDING', 'CONFIRMED'] },
            startTime: { lt: shiftedEnd },
            endTime: { gt: shiftedStart },
          },
        });

        if (conflict) {
          return NextResponse.json(
            {
              error: `Conflict on ${formatInTimeZone(shiftedStart, fb.timezone, 'EEEE, MMMM d')}. Cannot reschedule all future occurrences.`,
              conflictDate: shiftedStart,
            },
            { status: 409 }
          );
        }
      }

      // Find calendar for updates
      const calendar = await prisma.calendar.findFirst({
        where: { userId: booking.hostId, isEnabled: true },
        orderBy: { isPrimary: 'desc' },
      });

      // Apply shifts to all future bookings
      for (const fb of futureBookings) {
        const shiftedStart = new Date(fb.startTime.getTime() + deltaMs);
        const shiftedEnd = addMinutes(shiftedStart, booking.eventType.length);

        await prisma.booking.update({
          where: { id: fb.id },
          data: {
            startTime: shiftedStart,
            endTime: shiftedEnd,
            rescheduleReason: reason || null,
            lastRescheduledAt: new Date(),
          },
        });

        // Update calendar event
        if (fb.calendarEventId && calendar) {
          try {
            if (calendar.provider === 'GOOGLE') {
              await updateGoogleCalendarEvent(calendar.id, fb.calendarEventId, { startTime: shiftedStart, endTime: shiftedEnd });
            } else if (calendar.provider === 'OUTLOOK') {
              await updateOutlookCalendarEvent(calendar.id, fb.calendarEventId, { startTime: shiftedStart, endTime: shiftedEnd });
            }
          } catch (calendarError) {
            console.warn('Failed to update calendar event for occurrence:', calendarError);
          }
        }

        // Reschedule reminders
        rescheduleBookingReminders(fb.id, fb.uid, shiftedStart).catch(console.error);
      }

      // Send one summary email for the first occurrence
      const emailData: BookingEmailData = {
        hostName: booking.host.name ?? 'Host',
        hostEmail: booking.host.email!,
        inviteeName: booking.inviteeName,
        inviteeEmail: booking.inviteeEmail,
        eventTitle: booking.eventType.title,
        eventDescription: booking.eventType.description ?? undefined,
        startTime: `${futureBookings.length} sessions rescheduled`,
        endTime: '',
        timezone: booking.timezone,
        bookingUid: booking.uid,
      };

      queueBookingRescheduledEmails(
        emailData,
        {
          start: formatInTimeZone(booking.startTime, booking.timezone, 'EEEE, MMMM d, yyyy h:mm a'),
          end: formatInTimeZone(booking.endTime, booking.timezone, 'h:mm a'),
        },
        {
          start: formatInTimeZone(booking.startTime, booking.host.timezone || booking.timezone, 'EEEE, MMMM d, yyyy h:mm a'),
          end: formatInTimeZone(booking.endTime, booking.host.timezone || booking.timezone, 'h:mm a'),
        },
        isHost,
        reason || undefined
      ).catch(console.error);

      // Webhook
      triggerBookingRescheduledWebhook(
        booking.hostId,
        {
          id: booking.id,
          uid: booking.uid,
          status: booking.status,
          startTime: newStart,
          endTime: newEnd,
          timezone: booking.timezone,
          location: booking.location,
          meetingUrl: booking.meetingUrl,
          inviteeName: booking.inviteeName,
          inviteeEmail: booking.inviteeEmail,
          inviteePhone: booking.inviteePhone,
          inviteeNotes: booking.inviteeNotes,
          responses: booking.responses as Record<string, unknown> | null,
          eventType: {
            id: booking.eventType.id,
            title: booking.eventType.title,
            slug: booking.eventType.slug,
            length: booking.eventType.length,
          },
          host: {
            id: booking.host.id,
            name: booking.host.name,
            email: booking.host.email!,
          },
        },
        booking.startTime,
        booking.endTime
      ).catch(console.error);

      if (!isHost) {
        const reschedNotif = buildBookingNotification('BOOKING_RESCHEDULED', {
          inviteeName: booking.inviteeName,
          eventTitle: booking.eventType.title,
          startTime: `${futureBookings.length} sessions rescheduled`,
        });
        createNotification({
          userId: booking.hostId,
          type: 'BOOKING_RESCHEDULED',
          ...reschedNotif,
          bookingId: booking.id,
        }).catch(console.error);
      }

      return NextResponse.json({
        success: true,
        message: `${futureBookings.length} booking(s) rescheduled successfully`,
        updatedCount: futureBookings.length,
      });
    }

    // ── Single scope (default): reschedule just this booking ──

    // Check for conflicting bookings at the new time (exclude this booking)
    const conflict = await prisma.booking.findFirst({
      where: {
        hostId: booking.hostId,
        id: { not: booking.id },
        status: { in: ['PENDING', 'CONFIRMED'] },
        startTime: { lt: newEnd },
        endTime: { gt: newStart },
      },
    });

    if (conflict) {
      return NextResponse.json(
        { error: 'This time slot conflicts with another booking' },
        { status: 409 }
      );
    }

    // Store old times for email (invitee's timezone)
    const oldStartFormatted = formatInTimeZone(
      booking.startTime,
      booking.timezone,
      'EEEE, MMMM d, yyyy h:mm a'
    );
    const oldEndFormatted = formatInTimeZone(
      booking.endTime,
      booking.timezone,
      'h:mm a'
    );

    // Store old times in host's timezone for host email
    const hostTimezone = booking.host.timezone || booking.timezone;
    const hostOldStartFormatted = formatInTimeZone(
      booking.startTime,
      hostTimezone,
      'EEEE, MMMM d, yyyy h:mm a'
    );
    const hostOldEndFormatted = formatInTimeZone(
      booking.endTime,
      hostTimezone,
      'h:mm a'
    );

    // Update the booking
    const updatedBooking = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        startTime: newStart,
        endTime: newEnd,
        rescheduleReason: reason || null,
        lastRescheduledAt: new Date(),
      },
    });

    // Update calendar event if exists
    if (booking.calendarEventId) {
      // Find the calendar that owns this event (could be Google or Outlook)
      const calendar = await prisma.calendar.findFirst({
        where: {
          userId: booking.hostId,
          isEnabled: true,
        },
        orderBy: { isPrimary: 'desc' },
      });

      if (calendar) {
        try {
          if (calendar.provider === 'GOOGLE') {
            await updateGoogleCalendarEvent(
              calendar.id,
              booking.calendarEventId,
              {
                startTime: newStart,
                endTime: newEnd,
              }
            );
          } else if (calendar.provider === 'OUTLOOK') {
            await updateOutlookCalendarEvent(
              calendar.id,
              booking.calendarEventId,
              {
                startTime: newStart,
                endTime: newEnd,
              }
            );
          }
        } catch (calendarError) {
          console.warn('Failed to update calendar event:', calendarError);
        }
      }
    }

    // Prepare email data with new times
    const emailData: BookingEmailData = {
      hostName: booking.host.name ?? 'Host',
      hostEmail: booking.host.email!,
      inviteeName: booking.inviteeName,
      inviteeEmail: booking.inviteeEmail,
      eventTitle: booking.eventType.title,
      eventDescription: booking.eventType.description ?? undefined,
      startTime: formatInTimeZone(
        newStart,
        booking.timezone,
        'EEEE, MMMM d, yyyy h:mm a'
      ),
      endTime: formatInTimeZone(newEnd, booking.timezone, 'h:mm a'),
      timezone: booking.timezone,
      location: booking.location ?? undefined,
      meetingUrl: booking.meetingUrl ?? undefined,
      bookingUid: booking.uid,
    };

    // Queue reschedule emails
    queueBookingRescheduledEmails(
      emailData,
      { start: oldStartFormatted, end: oldEndFormatted },
      { start: hostOldStartFormatted, end: hostOldEndFormatted },
      isHost,
      reason || undefined
    ).catch(console.error);

    // Reschedule reminders
    rescheduleBookingReminders(booking.id, booking.uid, newStart).catch(console.error);

    // Trigger webhook for booking.rescheduled
    triggerBookingRescheduledWebhook(
      booking.hostId,
      {
        id: booking.id,
        uid: booking.uid,
        status: booking.status,
        startTime: newStart,
        endTime: newEnd,
        timezone: booking.timezone,
        location: booking.location,
        meetingUrl: booking.meetingUrl,
        inviteeName: booking.inviteeName,
        inviteeEmail: booking.inviteeEmail,
        inviteePhone: booking.inviteePhone,
        inviteeNotes: booking.inviteeNotes,
        responses: booking.responses as Record<string, unknown> | null,
        eventType: {
          id: booking.eventType.id,
          title: booking.eventType.title,
          slug: booking.eventType.slug,
          length: booking.eventType.length,
        },
        host: {
          id: booking.host.id,
          name: booking.host.name,
          email: booking.host.email!,
        },
      },
      booking.startTime,
      booking.endTime
    ).catch(console.error);

    // Only notify host if the invitee rescheduled (not the host themselves)
    if (!isHost) {
      const reschedNotif = buildBookingNotification('BOOKING_RESCHEDULED', {
        inviteeName: booking.inviteeName,
        eventTitle: booking.eventType.title,
        startTime: formatInTimeZone(newStart, booking.timezone, 'MMM d, h:mm a'),
      });
      createNotification({
        userId: booking.hostId,
        type: 'BOOKING_RESCHEDULED',
        ...reschedNotif,
        bookingId: booking.id,
      }).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      message: 'Booking rescheduled successfully',
      booking: {
        id: updatedBooking.id,
        uid: updatedBooking.uid,
        startTime: updatedBooking.startTime,
        endTime: updatedBooking.endTime,
      },
    });
  } catch (error) {
    console.error('POST reschedule booking error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
