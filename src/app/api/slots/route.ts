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
        bookings: {
          where: {
            status: { in: ['PENDING', 'CONFIRMED'] },
            startTime: {
              gte: new Date(),
            },
          },
          select: {
            startTime: true,
            endTime: true,
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

    // Determine date range
    const now = new Date();
    const rangeStart = startDate ? parseISO(startDate) : now;
    const maxDays = eventType.periodDays ?? 30;
    const rangeEnd = endDate
      ? parseISO(endDate)
      : addDays(now, maxDays);

    // Get busy times from connected calendars
    const calendarBusyTimes = await getAllBusyTimes(
      eventType.userId,
      rangeStart,
      addDays(rangeEnd, 1)
    );

    // Convert existing bookings to busy times
    const bookingBusyTimes = eventType.bookings.map((b) => ({
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
    const availability = schedule?.slots.map((s) => ({
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
    })) ?? [];

    const dateOverrides = schedule?.overrides.map((o) => ({
      date: o.date,
      isWorking: o.isWorking,
      startTime: o.startTime ?? undefined,
      endTime: o.endTime ?? undefined,
    })) ?? [];

    // Count bookings per day (for maxBookingsPerDay limit)
    const bookingsPerDay = new Map<string, number>();
    for (const booking of eventType.bookings) {
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

    return NextResponse.json({
      slots,
      eventType: {
        id: eventType.id,
        title: eventType.title,
        duration: eventType.length,
        timezone: eventType.user.timezone,
      },
    });
  } catch (error) {
    console.error('Slots API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
