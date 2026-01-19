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

// Rate limiting map (in production, use Redis)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
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

    // Type assertion for fields we need
    const eventTypeWithPeriod = eventType as typeof eventType & {
      periodType: 'ROLLING' | 'RANGE' | 'UNLIMITED';
      periodStartDate: Date | null;
      periodEndDate: Date | null;
    };

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
    switch (eventTypeWithPeriod.periodType) {
      case 'RANGE':
        // Use specific date range
        const periodStart = eventTypeWithPeriod.periodStartDate ? new Date(eventTypeWithPeriod.periodStartDate) : now;
        const periodEnd = eventTypeWithPeriod.periodEndDate ? new Date(eventTypeWithPeriod.periodEndDate) : addDays(now, 30);

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

    // Convert existing bookings to busy times
    const bookingBusyTimes = allHostBookings.map((b) => ({
      start: b.startTime,
      end: b.endTime,
    }));

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
    const slots = calculator.calculate(rangeStart);

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
    }).catch(() => {}); // Ignore errors

    // Calculate booking window boundaries for the frontend
    let bookingWindowStart: Date = now;
    let bookingWindowEnd: Date | null = null;

    switch (eventTypeWithPeriod.periodType) {
      case 'RANGE':
        if (eventTypeWithPeriod.periodStartDate) {
          bookingWindowStart = new Date(eventTypeWithPeriod.periodStartDate);
          if (bookingWindowStart < now) bookingWindowStart = now;
        }
        if (eventTypeWithPeriod.periodEndDate) {
          bookingWindowEnd = new Date(eventTypeWithPeriod.periodEndDate);
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
      },
      bookingWindow: {
        type: eventTypeWithPeriod.periodType,
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