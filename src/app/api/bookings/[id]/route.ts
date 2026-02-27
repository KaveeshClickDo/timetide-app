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
import { cancelBookingSchema, confirmRejectBookingSchema } from '@/lib/validation/schemas';
import { deleteGoogleCalendarEvent } from '@/lib/calendar/google';
import { BookingEmailData, RecurringBookingEmailData } from '@/lib/email/client';
import {
  queueBookingCancellationEmails,
  queueBookingConfirmedByHostEmail,
  queueBookingRejectedEmail,
  queueBulkConfirmedByHostEmail,
  scheduleBookingReminders,
  cancelBookingReminders,
  triggerBookingConfirmedWebhook,
  triggerBookingRejectedWebhook,
  triggerBookingCancelledWebhook,
} from '@/lib/queue';
import { createNotification, buildBookingNotification } from '@/lib/notifications';
import { FREQUENCY_LABELS, type RecurringFrequency } from '@/lib/recurring/utils';

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
            schedulingType: true,
            teamId: true,
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

    // Also fetch assigned user if exists
    let assignedUser = null;
    if (booking?.assignedUserId) {
      assignedUser = await prisma.user.findUnique({
        where: { id: booking.assignedUserId },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      });
    }

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Check authorization - host can always access, others need the UID
    const isHost = session?.user?.id === booking.hostId;
    const accessedByUid = id === booking.uid;

    if (!isHost && !accessedByUid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Fetch recurring siblings if this is a recurring booking
    let recurringBookings = null;
    if (booking.recurringGroupId) {
      recurringBookings = await prisma.booking.findMany({
        where: { recurringGroupId: booking.recurringGroupId },
        select: {
          id: true,
          uid: true,
          startTime: true,
          endTime: true,
          status: true,
          recurringIndex: true,
        },
        orderBy: { startTime: 'asc' },
      });
    }

    // Mask sensitive info for non-hosts
    const response = {
      ...booking,
      assignedUser: isHost ? assignedUser : null,
      host: isHost ? booking.host : {
        name: booking.host.name,
        image: booking.host.image,
      },
      eventType: booking.eventType,
      recurringBookings,
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

    // Parse and validate body
    const body = await request.json();
    const parsed = confirmRejectBookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { action, reason, scope } = parsed.data;

    // ── Skip / Unskip: separate flow, different status requirements ──
    if (action === 'skip' || action === 'unskip') {
      const expectedStatus = action === 'skip'
        ? { in: ['PENDING', 'CONFIRMED'] as ('PENDING' | 'CONFIRMED')[] }
        : ('SKIPPED' as const);
      const skipBooking = await prisma.booking.findFirst({
        where: {
          OR: [{ id }, { uid: id }],
          status: expectedStatus,
        },
        include: {
          eventType: { select: { title: true, slug: true, length: true, description: true, requiresConfirmation: true } },
          host: { select: { id: true, name: true, email: true, username: true, timezone: true } },
        },
      });

      if (!skipBooking) {
        return NextResponse.json(
          { error: action === 'skip' ? 'Booking not found or cannot be skipped' : 'Booking not found or is not skipped' },
          { status: 404 }
        );
      }

      if (session.user.id !== skipBooking.hostId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      // Must be a recurring booking
      if (!skipBooking.recurringGroupId) {
        return NextResponse.json(
          { error: 'Only recurring bookings can be skipped' },
          { status: 400 }
        );
      }

      const newStatus = action === 'skip'
        ? 'SKIPPED'
        : skipBooking.eventType.requiresConfirmation ? 'PENDING' : 'CONFIRMED';

      await prisma.booking.update({
        where: { id: skipBooking.id },
        data: { status: newStatus },
      });

      if (action === 'skip') {
        // Delete calendar event
        if (skipBooking.calendarEventId) {
          const cal = await prisma.calendar.findFirst({
            where: { userId: skipBooking.hostId, isPrimary: true, provider: 'GOOGLE' },
          });
          if (cal) {
            deleteGoogleCalendarEvent(cal.id, skipBooking.calendarEventId).catch(console.error);
          }
        }
        // Cancel reminders
        cancelBookingReminders(skipBooking.uid).catch(console.error);
      } else {
        // Unskip: reschedule reminders only if restored to CONFIRMED
        if (newStatus === 'CONFIRMED') {
          scheduleBookingReminders(skipBooking.id, skipBooking.uid, skipBooking.startTime).catch(console.error);
        }
      }

      // Notification
      const notifType = action === 'skip' ? 'BOOKING_CANCELLED' : 'BOOKING_CONFIRMED';
      const notif = buildBookingNotification(notifType, {
        inviteeName: skipBooking.inviteeName,
        eventTitle: skipBooking.eventType.title,
        startTime: formatInTimeZone(skipBooking.startTime, skipBooking.timezone, 'MMM d, h:mm a'),
      });
      createNotification({
        userId: skipBooking.hostId,
        type: notifType,
        ...notif,
        bookingId: skipBooking.id,
      }).catch(console.error);

      return NextResponse.json({
        success: true,
        message: action === 'skip' ? 'Occurrence skipped' : 'Occurrence restored',
        status: newStatus,
      });
    }

    // Find the booking (for confirm/reject — must be PENDING)
    const booking = await prisma.booking.findFirst({
      where: {
        OR: [{ id }, { uid: id }],
        status: 'PENDING',
      },
      include: {
        eventType: {
          select: {
            title: true,
            slug: true,
            length: true,
            description: true,
          },
        },
        host: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
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

    const newStatus = action === 'confirm' ? 'CONFIRMED' : 'REJECTED';

    // ── Bulk scope: confirm/reject ALL pending in series ──
    if (scope === 'all_pending' && booking.recurringGroupId) {
      const pendingBookings = await prisma.booking.findMany({
        where: {
          recurringGroupId: booking.recurringGroupId,
          status: 'PENDING',
        },
        orderBy: { startTime: 'asc' },
      });

      if (pendingBookings.length === 0) {
        return NextResponse.json(
          { error: 'No pending bookings found in this series' },
          { status: 404 }
        );
      }

      // Bulk update all pending bookings
      await prisma.booking.updateMany({
        where: {
          recurringGroupId: booking.recurringGroupId,
          status: 'PENDING',
        },
        data: {
          status: newStatus,
          ...(action === 'reject' && {
            cancellationReason: reason,
            cancelledAt: new Date(),
          }),
        },
      });

      if (action === 'confirm') {
        // Schedule reminders for each confirmed occurrence
        for (const pb of pendingBookings) {
          scheduleBookingReminders(pb.id, pb.uid, pb.startTime).catch(console.error);
        }

        // Send one bulk confirmed email with all dates
        const recurringEmailData: RecurringBookingEmailData = {
          hostName: booking.host.name ?? 'Host',
          hostEmail: booking.host.email!,
          hostUsername: booking.host.username ?? undefined,
          inviteeName: booking.inviteeName,
          inviteeEmail: booking.inviteeEmail,
          eventTitle: booking.eventType.title,
          eventSlug: booking.eventType.slug,
          eventDescription: booking.eventType.description ?? undefined,
          startTime: formatInTimeZone(pendingBookings[0].startTime, pendingBookings[0].timezone, 'EEEE, MMMM d, yyyy h:mm a'),
          endTime: formatInTimeZone(pendingBookings[0].endTime, pendingBookings[0].timezone, 'h:mm a'),
          timezone: booking.timezone,
          location: booking.location ?? undefined,
          meetingUrl: booking.meetingUrl ?? undefined,
          bookingUid: pendingBookings[0].uid,
          recurringDates: pendingBookings.map(pb => ({
            startTime: formatInTimeZone(pb.startTime, pb.timezone, 'EEEE, MMMM d, yyyy h:mm a'),
            endTime: formatInTimeZone(pb.endTime, pb.timezone, 'h:mm a'),
          })),
          totalOccurrences: pendingBookings.length,
          frequencyLabel: booking.recurringFrequency
            ? FREQUENCY_LABELS[booking.recurringFrequency as RecurringFrequency]?.toLowerCase()
            : undefined,
        };
        queueBulkConfirmedByHostEmail(recurringEmailData).catch(console.error);

        // Webhook
        triggerBookingConfirmedWebhook(booking.hostId, {
          id: booking.id,
          uid: booking.uid,
          status: newStatus,
          startTime: booking.startTime,
          endTime: booking.endTime,
          timezone: booking.timezone,
          location: booking.location,
          meetingUrl: booking.meetingUrl,
          inviteeName: booking.inviteeName,
          inviteeEmail: booking.inviteeEmail,
          inviteePhone: booking.inviteePhone,
          inviteeNotes: booking.inviteeNotes,
          responses: booking.responses as Record<string, unknown> | null,
          eventType: {
            id: booking.eventTypeId,
            title: booking.eventType.title,
            slug: booking.eventType.slug,
            length: booking.eventType.length,
          },
          host: {
            id: booking.host.id,
            name: booking.host.name,
            email: booking.host.email!,
          },
        }).catch(console.error);
      } else {
        // Reject: delete calendar events for all pending bookings
        const primaryCalendar = await prisma.calendar.findFirst({
          where: { userId: booking.hostId, isPrimary: true, provider: 'GOOGLE' },
        });
        for (const pb of pendingBookings) {
          if (pb.calendarEventId && primaryCalendar) {
            deleteGoogleCalendarEvent(primaryCalendar.id, pb.calendarEventId).catch(console.error);
          }
        }
        queueBookingRejectedEmail({
          hostName: booking.host.name ?? 'Host',
          hostEmail: booking.host.email!,
          hostUsername: booking.host.username ?? undefined,
          inviteeName: booking.inviteeName,
          inviteeEmail: booking.inviteeEmail,
          eventTitle: booking.eventType.title,
          eventSlug: booking.eventType.slug,
          startTime: `${pendingBookings.length} sessions`,
          endTime: '',
          timezone: booking.timezone,
          bookingUid: booking.uid,
        }, reason).catch(console.error);

        triggerBookingRejectedWebhook(booking.hostId, {
          id: booking.id,
          uid: booking.uid,
          status: newStatus,
          startTime: booking.startTime,
          endTime: booking.endTime,
          timezone: booking.timezone,
          location: booking.location,
          meetingUrl: booking.meetingUrl,
          inviteeName: booking.inviteeName,
          inviteeEmail: booking.inviteeEmail,
          inviteePhone: booking.inviteePhone,
          inviteeNotes: booking.inviteeNotes,
          responses: booking.responses as Record<string, unknown> | null,
          eventType: {
            id: booking.eventTypeId,
            title: booking.eventType.title,
            slug: booking.eventType.slug,
            length: booking.eventType.length,
          },
          host: {
            id: booking.host.id,
            name: booking.host.name,
            email: booking.host.email!,
          },
        }, reason).catch(console.error);
      }

      // Notification
      const bulkNotif = buildBookingNotification(
        action === 'confirm' ? 'BOOKING_CONFIRMED' : 'BOOKING_REJECTED',
        {
          inviteeName: booking.inviteeName,
          eventTitle: booking.eventType.title,
          startTime: `${pendingBookings.length} sessions ${action === 'confirm' ? 'confirmed' : 'rejected'}`,
        }
      );
      createNotification({
        userId: booking.hostId,
        type: action === 'confirm' ? 'BOOKING_CONFIRMED' : 'BOOKING_REJECTED',
        ...bulkNotif,
        bookingId: booking.id,
      }).catch(console.error);

      return NextResponse.json({
        success: true,
        message: `${pendingBookings.length} booking(s) ${action === 'confirm' ? 'confirmed' : 'rejected'} successfully`,
        status: newStatus,
        updatedCount: pendingBookings.length,
      });
    }

    // ── Single scope (default): confirm/reject just this booking ──
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
      hostUsername: booking.host.username ?? undefined,
      inviteeName: booking.inviteeName,
      inviteeEmail: booking.inviteeEmail,
      eventTitle: booking.eventType.title,
      eventSlug: booking.eventType.slug,
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

    // Build webhook payload data
    const webhookBookingData = {
      id: booking.id,
      uid: booking.uid,
      status: newStatus,
      startTime: booking.startTime,
      endTime: booking.endTime,
      timezone: booking.timezone,
      location: booking.location,
      meetingUrl: booking.meetingUrl,
      inviteeName: booking.inviteeName,
      inviteeEmail: booking.inviteeEmail,
      inviteePhone: booking.inviteePhone,
      inviteeNotes: booking.inviteeNotes,
      responses: booking.responses as Record<string, unknown> | null,
      eventType: {
        id: booking.eventTypeId,
        title: booking.eventType.title,
        slug: booking.eventType.slug,
        length: booking.eventType.length,
      },
      host: {
        id: booking.host.id,
        name: booking.host.name,
        email: booking.host.email!,
      },
    };

    // Send appropriate email, schedule reminders, and trigger webhooks
    if (action === 'confirm') {
      queueBookingConfirmedByHostEmail(emailData).catch(console.error);
      // Schedule reminders for newly confirmed booking
      scheduleBookingReminders(booking.id, booking.uid, booking.startTime).catch(console.error);
      // Trigger webhook
      triggerBookingConfirmedWebhook(booking.hostId, webhookBookingData).catch(console.error);
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
      queueBookingRejectedEmail(emailData, reason).catch(console.error);
      // Trigger webhook
      triggerBookingRejectedWebhook(booking.hostId, webhookBookingData, reason).catch(console.error);
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

    // Parse cancellation reason and cancelAllFuture from body
    let reason: string | undefined;
    let cancelAllFuture = false;
    try {
      const body = await request.json();
      const validated = cancelBookingSchema.safeParse(body);
      if (validated.success) {
        reason = validated.data.reason;
        cancelAllFuture = validated.data.cancelAllFuture ?? false;
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
            slug: true,
            length: true,
            description: true,
          },
        },
        host: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
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

    // ========================================================================
    // CANCEL ALL FUTURE — recurring series bulk cancel
    // ========================================================================
    if (cancelAllFuture && booking.recurringGroupId) {
      const futureBookings = await prisma.booking.findMany({
        where: {
          recurringGroupId: booking.recurringGroupId,
          startTime: { gte: booking.startTime },
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
        include: {
          eventType: { select: { title: true, slug: true, length: true, description: true } },
          host: { select: { id: true, name: true, email: true, username: true, timezone: true } },
        },
      });

      // Cancel all in a batch
      await prisma.booking.updateMany({
        where: {
          id: { in: futureBookings.map(b => b.id) },
        },
        data: {
          status: 'CANCELLED',
          cancellationReason: reason,
          cancelledAt: new Date(),
        },
      });

      // Delete calendar events and cancel reminders for all
      for (const fb of futureBookings) {
        if (fb.calendarEventId) {
          const cal = await prisma.calendar.findFirst({
            where: { userId: fb.hostId, isPrimary: true, provider: 'GOOGLE' },
          });
          if (cal) {
            deleteGoogleCalendarEvent(cal.id, fb.calendarEventId).catch(console.error);
          }
        }
        cancelBookingReminders(fb.uid).catch(console.error);
      }

      // Send one cancellation email for the series
      const emailData: BookingEmailData = {
        hostName: booking.host.name ?? 'Host',
        hostEmail: booking.host.email!,
        hostUsername: booking.host.username ?? undefined,
        inviteeName: booking.inviteeName,
        inviteeEmail: booking.inviteeEmail,
        eventTitle: booking.eventType.title,
        eventSlug: booking.eventType.slug,
        eventDescription: booking.eventType.description ?? undefined,
        startTime: futureBookings.length === 1
          ? formatInTimeZone(futureBookings[0].startTime, futureBookings[0].timezone, 'EEEE, MMMM d, yyyy h:mm a')
          : `${futureBookings.length} sessions (${formatInTimeZone(futureBookings[0].startTime, futureBookings[0].timezone, 'MMM d')} - ${formatInTimeZone(futureBookings[futureBookings.length - 1].startTime, futureBookings[futureBookings.length - 1].timezone, 'MMM d, yyyy')})`,
        endTime: formatInTimeZone(booking.endTime, booking.timezone, 'h:mm a'),
        timezone: booking.timezone,
        bookingUid: booking.uid,
      };
      queueBookingCancellationEmails(emailData, reason, isHost).catch(console.error);

      // Notification
      if (!isHost) {
        const cancelNotif = buildBookingNotification('BOOKING_CANCELLED', {
          inviteeName: booking.inviteeName,
          eventTitle: booking.eventType.title,
          startTime: `${futureBookings.length} sessions cancelled`,
        });
        createNotification({
          userId: booking.hostId,
          type: 'BOOKING_CANCELLED',
          ...cancelNotif,
          bookingId: booking.id,
        }).catch(console.error);
      }

      return NextResponse.json({
        success: true,
        message: `Cancelled ${futureBookings.length} booking(s)`,
        cancelledCount: futureBookings.length,
      });
    }

    // ========================================================================
    // CANCEL SINGLE BOOKING (existing flow)
    // ========================================================================
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
      hostUsername: booking.host.username ?? undefined,
      inviteeName: booking.inviteeName,
      inviteeEmail: booking.inviteeEmail,
      eventTitle: booking.eventType.title,
      eventSlug: booking.eventType.slug,
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

    queueBookingCancellationEmails(emailData, reason, isHost).catch(console.error);
    cancelBookingReminders(booking.uid).catch(console.error);

    triggerBookingCancelledWebhook(
      booking.hostId,
      {
        id: booking.id,
        uid: booking.uid,
        status: 'CANCELLED',
        startTime: booking.startTime,
        endTime: booking.endTime,
        timezone: booking.timezone,
        location: booking.location,
        meetingUrl: booking.meetingUrl,
        inviteeName: booking.inviteeName,
        inviteeEmail: booking.inviteeEmail,
        inviteePhone: booking.inviteePhone,
        inviteeNotes: booking.inviteeNotes,
        responses: booking.responses as Record<string, unknown> | null,
        eventType: {
          id: booking.eventTypeId,
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
      reason
    ).catch(console.error);

    if (!isHost) {
      const cancelNotif = buildBookingNotification('BOOKING_CANCELLED', {
        inviteeName: booking.inviteeName,
        eventTitle: booking.eventType.title,
        startTime: formatInTimeZone(booking.startTime, booking.timezone, 'MMM d, h:mm a'),
      });
      createNotification({
        userId: booking.hostId,
        type: 'BOOKING_CANCELLED',
        ...cancelNotif,
        bookingId: booking.id,
      }).catch(console.error);
    }

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
