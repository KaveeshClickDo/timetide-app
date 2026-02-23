/**
 * GET /api/slots
 * Public endpoint to get available time slots for an event type
 */

import { NextRequest, NextResponse } from 'next/server';
import { addDays, parseISO, startOfDay } from 'date-fns';
import prisma from '@/lib/prisma';
import { getSlotsQuerySchema } from '@/lib/validation/schemas';
import {
  SlotCalculator,
  mergeBusyTimes,
  CalculatedSlots,
} from '@/lib/slots/calculator';
import { getAllBusyTimes } from '@/lib/calendar/google';
import { checkSlotsRateLimit } from '@/lib/queue';

export async function GET(request: NextRequest) {
  try {
    // Rate limiting (Redis-backed with in-memory fallback)
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const rateLimitResult = await checkSlotsRateLimit(ip);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
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

    // Parse and validate query params
    const searchParams = request.nextUrl.searchParams;
    const query = {
      eventTypeId: searchParams.get('eventTypeId'),
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
      timezone: searchParams.get('timezone') ?? 'UTC',
    };

    const validated = getSlotsQuerySchema.safeParse(query);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { eventTypeId, startDate, endDate, timezone } = validated.data;

    // Fetch event type with schedule and user
    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId, isActive: true },
      include: {
        user: { select: { id: true, timezone: true } },
        schedule: {
          include: {
            slots: true,
            overrides: true,
          },
        },
      },
    });

    if (!eventType) {
      return NextResponse.json(
        { error: 'Event type not found' },
        { status: 404 }
      );
    }

    // Determine date range based on period type
    const now = new Date();
    let rangeStart = startDate ? parseISO(startDate) : now;
    let rangeEnd: Date;
    let maxDays: number;

    // Calculate booking window based on period type
    switch (eventType.periodType) {
      case 'RANGE':
        // Use specific date range
        const periodStart = eventType.periodStartDate ? new Date(eventType.periodStartDate) : now;
        const periodEnd = eventType.periodEndDate ? new Date(eventType.periodEndDate) : addDays(now, 30);

        // Ensure rangeStart is not before periodStart
        if (rangeStart < periodStart) {
          rangeStart = periodStart;
        }
        // Ensure rangeStart is not before today
        if (rangeStart < now) {
          rangeStart = now;
        }

        // Calculate rangeEnd - use the earlier of endDate or periodEnd
        rangeEnd = endDate ? parseISO(endDate) : periodEnd;
        if (rangeEnd > periodEnd) {
          rangeEnd = periodEnd;
        }

        // Calculate maxDays for the calculator
        maxDays = Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        break;

      case 'UNLIMITED':
        // No restrictions, but we still limit per-request to prevent overload
        // Default to 90 days max per request for performance
        maxDays = 90;
        rangeEnd = endDate ? parseISO(endDate) : addDays(now, maxDays);
        break;

      case 'ROLLING':
      default:
        // Rolling window from today
        maxDays = eventType.periodDays ?? 30;
        rangeEnd = endDate ? parseISO(endDate) : addDays(now, maxDays);

        // Ensure we don't exceed the rolling window
        const rollingLimit = addDays(now, maxDays);
        if (rangeEnd > rollingLimit) {
          rangeEnd = rollingLimit;
        }
        break;
    }

    // CRITICAL: Fetch ALL bookings for this host (across all event types) to prevent double booking
    const allHostBookings = await prisma.booking.findMany({
      where: {
        hostId: eventType.userId, // Check all bookings for this host, not just this event type
        status: { in: ['PENDING', 'CONFIRMED'] },
        // Include bookings that end in the future (even if they started in the past)
        endTime: {
          gte: now,
        },
      },
      select: {
        startTime: true,
        endTime: true,
        eventTypeId: true,
      },
    });

    // Get busy times from connected calendars
    // IMPORTANT: Wrap in try-catch to handle missing/unconfigured calendar
    let calendarBusyTimes: { start: Date; end: Date }[] = [];
    try {
      calendarBusyTimes = await getAllBusyTimes(
        eventType.userId,
        rangeStart,
        addDays(rangeEnd, 1)
      );
    } catch (calendarError) {
      // Log but don't fail - just proceed without calendar busy times
      console.warn('Could not fetch calendar busy times:', calendarError);
      // Calendar not connected or error - proceed without external busy times
    }

    // For group events (seatsPerSlot > 1): don't treat this event type's bookings as busy
    // times unless the slot is fully booked. Other event types' bookings still block as usual.
    const isGroupEvent = (eventType.seatsPerSlot ?? 1) > 1;
    const seatsPerSlot = eventType.seatsPerSlot ?? 1;

    // Track per-slot booking counts for group events
    const slotBookingCounts = new Map<string, number>();

    let bookingBusyTimes: { start: Date; end: Date }[];
    if (isGroupEvent) {
      // Separate bookings: other event types always block, same event type only when full
      const otherEventBookings: { start: Date; end: Date }[] = [];

      for (const b of allHostBookings) {
        if (b.eventTypeId === eventTypeId) {
          // Count bookings per time slot for this group event
          const slotKey = b.startTime.toISOString();
          slotBookingCounts.set(slotKey, (slotBookingCounts.get(slotKey) ?? 0) + 1);
        } else {
          otherEventBookings.push({ start: b.startTime, end: b.endTime });
        }
      }

      // Add fully-booked group slots as busy times
      const fullyBookedSlots: { start: Date; end: Date }[] = [];
      for (const b of allHostBookings) {
        if (b.eventTypeId === eventTypeId) {
          const slotKey = b.startTime.toISOString();
          const count = slotBookingCounts.get(slotKey) ?? 0;
          if (count >= seatsPerSlot) {
            fullyBookedSlots.push({ start: b.startTime, end: b.endTime });
          }
        }
      }

      bookingBusyTimes = [...otherEventBookings, ...fullyBookedSlots];
    } else {
      // Regular events: all bookings are busy times
      bookingBusyTimes = allHostBookings.map((b) => ({
        start: b.startTime,
        end: b.endTime,
      }));
    }

    // Merge all busy times
    const allBusyTimes = mergeBusyTimes([
      ...calendarBusyTimes,
      ...bookingBusyTimes,
    ]);

    // Get availability from schedule or use defaults
    const schedule = eventType.schedule;
    
    // If no schedule is set up, return empty slots with a helpful message
    if (!schedule || !schedule.slots || schedule.slots.length === 0) {
      console.warn(`Event type ${eventTypeId} has no availability schedule configured`);
      return NextResponse.json({
        slots: {},
        eventType: {
          id: eventType.id,
          title: eventType.title,
          duration: eventType.length,
          timezone: eventType.user.timezone,
        },
        message: 'No availability schedule configured',
      });
    }

    const availability = schedule.slots.map((s) => ({
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
    }));

    const dateOverrides = schedule.overrides?.map((o) => ({
      date: o.date,
      isWorking: o.isWorking,
      startTime: o.startTime ?? undefined,
      endTime: o.endTime ?? undefined,
    })) ?? [];

    // Fetch bookings specifically for this event type for the maxBookingsPerDay check
    // Note: maxBookingsPerDay limit is per event type, not per host
    const eventTypeBookings = await prisma.booking.findMany({
      where: {
        eventTypeId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        endTime: {
          gte: now,
        },
      },
      select: {
        startTime: true,
      },
    });

    const bookingsPerDay = new Map<string, number>();
    for (const booking of eventTypeBookings) {
      const dateKey = booking.startTime.toISOString().split('T')[0];
      bookingsPerDay.set(dateKey, (bookingsPerDay.get(dateKey) ?? 0) + 1);
    }

    // Create slot calculator
    const calculator = new SlotCalculator({
      duration: eventType.length,
      bufferBefore: eventType.bufferTimeBefore,
      bufferAfter: eventType.bufferTimeAfter,
      slotInterval: eventType.slotInterval ?? undefined,
      minimumNotice: eventType.minimumNotice,
      maxDaysInAdvance: maxDays,
      hostTimezone: eventType.user.timezone ?? 'UTC',
      inviteeTimezone: timezone,
      availability,
      dateOverrides,
      busyTimes: allBusyTimes,
      maxBookingsPerDay: eventType.maxBookingsPerDay ?? undefined,
      existingBookingsPerDay: bookingsPerDay,
    });

    // Calculate available slots
    const calculatedSlots = calculator.calculate(rangeStart);

    // For group events, enrich slots with remaining seat counts
    let slots: Record<string, Array<{ start: Date; end: Date; seatsRemaining?: number }>>;
    if (isGroupEvent) {
      slots = {};
      for (const [dateKey, daySlots] of Object.entries(calculatedSlots)) {
        slots[dateKey] = daySlots.map((slot) => {
          const slotKey = slot.start.toISOString();
          const booked = slotBookingCounts.get(slotKey) ?? 0;
          return {
            ...slot,
            seatsRemaining: seatsPerSlot - booked,
          };
        });
      }
    } else {
      slots = calculatedSlots;
    }

    // Track analytics (fire and forget)
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
        views: 1,
      },
      update: {
        views: { increment: 1 },
      },
    }).catch((err) => { console.warn('Analytics update failed:', err); });

    // Calculate booking window boundaries for the frontend
    let bookingWindowStart: Date = now;
    let bookingWindowEnd: Date | null = null;

    switch (eventType.periodType) {
      case 'RANGE':
        if (eventType.periodStartDate) {
          bookingWindowStart = new Date(eventType.periodStartDate);
          if (bookingWindowStart < now) bookingWindowStart = now;
        }
        if (eventType.periodEndDate) {
          bookingWindowEnd = new Date(eventType.periodEndDate);
        }
        break;
      case 'ROLLING':
        bookingWindowEnd = addDays(now, eventType.periodDays ?? 30);
        break;
      case 'UNLIMITED':
        // No end boundary
        break;
    }

    return NextResponse.json({
      slots,
      eventType: {
        id: eventType.id,
        title: eventType.title,
        duration: eventType.length,
        timezone: eventType.user.timezone,
        seatsPerSlot: seatsPerSlot,
      },
      bookingWindow: {
        type: eventType.periodType,
        start: bookingWindowStart.toISOString(),
        end: bookingWindowEnd?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error('Slots API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}