/**
 * /api/bookings/[id]
 * GET: Get booking details
 * DELETE: Cancel booking
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { formatInTimeZone } from 'date-fns-tz';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { cancelBookingSchema } from '@/lib/validation/schemas';
import { deleteGoogleCalendarEvent } from '@/lib/calendar/google';
import {
  sendBookingCancellationEmails,
  sendBookingConfirmedByHostEmail,
  sendBookingRejectedEmail,
  BookingEmailData,
} from '@/lib/email/client';

interface RouteParams {
  params: { id: string };
}

/**
 * GET /api/bookings/[id]
 * Get booking details - accessible by host or via booking UID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;
    const session = await getServerSession(authOptions);

    // Try to find by ID or UID
    const booking = await prisma.booking.findFirst({
      where: {
        OR: [{ id }, { uid: id }],
      },
      include: {
        eventType: {
          select: {
            id: true,
            title: true,
            description: true,
            length: true,
            locationType: true,
            locationValue: true,
            questions: true,
          },
        },
        host: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            timezone: true,
          },
        },
      },
    });

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Check authorization - host can always access, others need the UID
    const isHost = session?.user?.id === booking.hostId;
    const accessedByUid = id === booking.uid;

    if (!isHost && !accessedByUid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Mask sensitive info for non-hosts
    const response = {
      ...booking,
      host: isHost ? booking.host : {
        name: booking.host.name,
        image: booking.host.image,
      },
      // Don't expose host's email to invitees
      eventType: booking.eventType,
    };

    return NextResponse.json({ booking: response });
  } catch (error) {
    console.error('GET booking error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/bookings/[id]
 * Confirm or reject a pending booking (host only)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse body
    const body = await request.json();
    const { action, reason } = body as { action: 'confirm' | 'reject'; reason?: string };

    if (!action || !['confirm', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "confirm" or "reject".' },
        { status: 400 }
      );
    }

    // Find the booking
    const booking = await prisma.booking.findFirst({
      where: {
        OR: [{ id }, { uid: id }],
        status: 'PENDING',
      },
      include: {
        eventType: {
          select: {
            title: true,
            description: true,
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
        { error: 'Booking not found or is not pending' },
        { status: 404 }
      );
    }

    // Only the host can confirm/reject
    if (session.user.id !== booking.hostId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Update booking status
    const newStatus = action === 'confirm' ? 'CONFIRMED' : 'REJECTED';
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: newStatus,
        ...(action === 'reject' && {
          cancellationReason: reason,
          cancelledAt: new Date(),
        }),
      },
    });

    // Prepare email data
    const emailData: BookingEmailData = {
      hostName: booking.host.name ?? 'Host',
      hostEmail: booking.host.email!,
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
      meetingUrl: booking.meetingUrl ?? undefined,
      bookingUid: booking.uid,
    };

    // Send appropriate email
    if (action === 'confirm') {
      sendBookingConfirmedByHostEmail(emailData).catch(console.error);
    } else {
      // Delete calendar event if rejecting
      if (booking.calendarEventId) {
        const primaryCalendar = await prisma.calendar.findFirst({
          where: {
            userId: booking.hostId,
            isPrimary: true,
            provider: 'GOOGLE',
          },
        });

        if (primaryCalendar) {
          await deleteGoogleCalendarEvent(
            primaryCalendar.id,
            booking.calendarEventId
          );
        }
      }
      sendBookingRejectedEmail(emailData, reason).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      message: `Booking ${action === 'confirm' ? 'confirmed' : 'rejected'} successfully`,
      status: newStatus,
    });
  } catch (error) {
    console.error('PATCH booking error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/bookings/[id]
 * Cancel a booking
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;
    const session = await getServerSession(authOptions);

    // Parse cancellation reason from body
    let reason: string | undefined;
    try {
      const body = await request.json();
      const validated = cancelBookingSchema.safeParse(body);
      if (validated.success) {
        reason = validated.data.reason;
      }
    } catch {
      // No body or invalid JSON - that's okay
    }

    // Find the booking
    const booking = await prisma.booking.findFirst({
      where: {
        OR: [{ id }, { uid: id }],
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      include: {
        eventType: {
          select: {
            title: true,
            description: true,
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
        { error: 'Booking not found or already cancelled' },
        { status: 404 }
      );
    }

    // Check authorization
    const isHost = session?.user?.id === booking.hostId;
    const accessedByUid = id === booking.uid;

    if (!isHost && !accessedByUid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Update booking status
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: 'CANCELLED',
        cancellationReason: reason,
        cancelledAt: new Date(),
      },
    });

    // Delete calendar event
    if (booking.calendarEventId) {
      const primaryCalendar = await prisma.calendar.findFirst({
        where: {
          userId: booking.hostId,
          isPrimary: true,
          provider: 'GOOGLE',
        },
      });

      if (primaryCalendar) {
        await deleteGoogleCalendarEvent(
          primaryCalendar.id,
          booking.calendarEventId
        );
      }
    }

    // Send cancellation emails
    const emailData: BookingEmailData = {
      hostName: booking.host.name ?? 'Host',
      hostEmail: booking.host.email!,
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
      bookingUid: booking.uid,
    };

    sendBookingCancellationEmails(emailData, reason, isHost).catch(console.error);

    return NextResponse.json({
      success: true,
      message: 'Booking cancelled successfully',
    });
  } catch (error) {
    console.error('DELETE booking error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
