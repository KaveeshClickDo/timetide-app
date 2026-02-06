/**
 * GET /api/slots/team
 * Public endpoint to get available time slots for a team event type
 * Supports all three scheduling types: ROUND_ROBIN, COLLECTIVE, MANAGED
 */

import { NextRequest, NextResponse } from 'next/server';
import { addDays, parseISO, startOfDay } from 'date-fns';
import prisma from '@/lib/prisma';
import { TeamSlotCalculator } from '@/lib/slots/team-calculator';
import { checkSlotsRateLimit } from '@/lib/queue';
import { z } from 'zod';

const teamSlotsQuerySchema = z.object({
  teamSlug: z.string().min(1),
  eventSlug: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  timezone: z.string().default('UTC'),
});

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
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

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const query = {
      teamSlug: searchParams.get('teamSlug') || '',
      eventSlug: searchParams.get('eventSlug') || '',
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      timezone: searchParams.get('timezone') || 'UTC',
    };

    const validated = teamSlotsQuerySchema.safeParse(query);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { teamSlug, eventSlug, startDate, endDate, timezone } = validated.data;

    // Find team
    const team = await prisma.team.findUnique({
      where: { slug: teamSlug },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Find event type
    const eventType = await prisma.eventType.findFirst({
      where: {
        teamId: team.id,
        slug: eventSlug,
        isActive: true,
      },
      include: {
        user: { select: { id: true, timezone: true } },
        teamMemberAssignments: {
          where: { isActive: true },
          include: {
            teamMember: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    image: true,
                    timezone: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!eventType) {
      return NextResponse.json({ error: 'Event type not found' }, { status: 404 });
    }

    if (!eventType.schedulingType) {
      return NextResponse.json(
        { error: 'Event type is not configured for team scheduling' },
        { status: 400 }
      );
    }

    // Determine date range
    const now = new Date();
    const rangeStart = startDate ? parseISO(startDate) : now;

    let maxDays: number;
    let rangeEnd: Date;

    const periodType = eventType.periodType as 'ROLLING' | 'RANGE' | 'UNLIMITED';

    switch (periodType) {
      case 'RANGE':
        const periodEnd = eventType.periodEndDate
          ? new Date(eventType.periodEndDate)
          : addDays(now, 30);
        maxDays = Math.ceil(
          (periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        rangeEnd = endDate ? parseISO(endDate) : periodEnd;
        break;
      case 'UNLIMITED':
        maxDays = 90;
        rangeEnd = endDate ? parseISO(endDate) : addDays(now, maxDays);
        break;
      case 'ROLLING':
      default:
        maxDays = eventType.periodDays ?? 30;
        rangeEnd = endDate ? parseISO(endDate) : addDays(now, maxDays);
        break;
    }

    // Create team slot calculator
    const calculator = new TeamSlotCalculator(
      eventType.id,
      team.id,
      eventType.schedulingType as 'ROUND_ROBIN' | 'COLLECTIVE' | 'MANAGED',
      eventType.lastAssignedMemberId || undefined
    );

    // Calculate slots
    const result = await calculator.calculate({
      duration: eventType.length,
      bufferBefore: eventType.bufferTimeBefore,
      bufferAfter: eventType.bufferTimeAfter,
      slotInterval: eventType.slotInterval || undefined,
      minimumNotice: eventType.minimumNotice,
      maxDaysInAdvance: maxDays,
      inviteeTimezone: timezone,
      maxBookingsPerDay: eventType.maxBookingsPerDay || undefined,
    });

    // Track analytics
    prisma.bookingAnalytics
      .upsert({
        where: {
          eventTypeId_date: {
            eventTypeId: eventType.id,
            date: startOfDay(new Date()),
          },
        },
        create: {
          eventTypeId: eventType.id,
          date: startOfDay(new Date()),
          views: 1,
        },
        update: {
          views: { increment: 1 },
        },
      })
      .catch((err) => { console.warn('Analytics update failed:', err); });

    // Calculate booking window boundaries
    let bookingWindowStart: Date = now;
    let bookingWindowEnd: Date | null = null;

    switch (periodType) {
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
        break;
    }

    return NextResponse.json({
      slots: result.slots,
      schedulingType: result.schedulingType,
      members: result.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.userName,
        image: m.userImage,
        timezone: m.timezone,
        priority: m.priority,
      })),
      eventType: {
        id: eventType.id,
        title: eventType.title,
        duration: eventType.length,
        requiresConfirmation: eventType.requiresConfirmation,
      },
      team: {
        id: team.id,
        name: team.name,
        slug: team.slug,
      },
      bookingWindow: {
        type: periodType,
        start: bookingWindowStart.toISOString(),
        end: bookingWindowEnd?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error('Team slots API error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
