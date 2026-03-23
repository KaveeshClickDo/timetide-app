/**
 * Calculate available time slots for a team event type.
 *
 * Handles: team + event type lookup, scheduling type validation,
 * period type logic (ROLLING/RANGE/UNLIMITED), TeamSlotCalculator
 * orchestration, booking window boundaries, and analytics tracking.
 */

import { addDays, parseISO, startOfDay } from 'date-fns'
import prisma from '@/server/db/prisma'
import { TeamSlotCalculator } from '@/server/scheduling/slots/team-calculator'

// ── Domain errors ─────────────────────────────────────────────────────────────

export class TeamSlotsTeamNotFoundError extends Error {
  constructor() {
    super('Team not found')
    this.name = 'TeamSlotsTeamNotFoundError'
  }
}

export class TeamSlotsEventTypeNotFoundError extends Error {
  constructor() {
    super('Event type not found')
    this.name = 'TeamSlotsEventTypeNotFoundError'
  }
}

export class TeamSlotsNotTeamSchedulingError extends Error {
  constructor() {
    super('Event type is not configured for team scheduling')
    this.name = 'TeamSlotsNotTeamSchedulingError'
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CalculateTeamSlotsParams {
  teamSlug: string
  eventSlug: string
  startDate?: string
  endDate?: string
  timezone: string
}

export interface CalculateTeamSlotsResult {
  slots: Record<string, Array<{ start: Date; end: Date; memberIds?: string[] }>>
  schedulingType: string
  members: Array<{
    id: string
    userId: string
    name: string | null
    image: string | null
    timezone: string | null
    priority: number
  }>
  eventType: {
    id: string
    title: string
    duration: number
    requiresConfirmation: boolean
    seatsPerSlot: number
  }
  team: {
    id: string
    name: string
    slug: string
  }
  bookingWindow: {
    type: string
    start: string
    end: string | null
  }
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function calculateTeamSlots(
  params: CalculateTeamSlotsParams
): Promise<CalculateTeamSlotsResult> {
  const { teamSlug, eventSlug, startDate, endDate, timezone } = params

  // Find team
  const team = await prisma.team.findUnique({
    where: { slug: teamSlug },
  })

  if (!team) {
    throw new TeamSlotsTeamNotFoundError()
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
  })

  if (!eventType) {
    throw new TeamSlotsEventTypeNotFoundError()
  }

  if (!eventType.schedulingType) {
    throw new TeamSlotsNotTeamSchedulingError()
  }

  // Determine date range
  const now = new Date()
  const rangeStart = startDate ? parseISO(startDate) : now

  let maxDays: number
  let rangeEnd: Date

  const periodType = eventType.periodType as 'ROLLING' | 'RANGE' | 'UNLIMITED'

  switch (periodType) {
    case 'RANGE': {
      let periodEnd = eventType.periodEndDate
        ? new Date(eventType.periodEndDate)
        : addDays(now, 30)
      const tenYearsFromNow = addDays(now, 365 * 10)
      if (periodEnd > tenYearsFromNow) periodEnd = tenYearsFromNow
      maxDays = Math.ceil(
        (periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )
      rangeEnd = endDate ? parseISO(endDate) : periodEnd
      break
    }
    case 'UNLIMITED':
      maxDays = 365 * 100
      rangeEnd = endDate ? parseISO(endDate) : addDays(now, 31)
      break
    case 'ROLLING':
    default:
      maxDays = eventType.periodDays ?? 30
      rangeEnd = endDate ? parseISO(endDate) : addDays(now, maxDays)
      break
  }

  // Create team slot calculator
  const calculator = new TeamSlotCalculator(
    eventType.id,
    team.id,
    eventType.schedulingType as 'ROUND_ROBIN' | 'COLLECTIVE' | 'MANAGED',
    eventType.lastAssignedMemberId || undefined
  )

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
    seatsPerSlot: eventType.seatsPerSlot ?? 1,
    rangeStart,
    rangeEnd,
  })

  // Track analytics (fire and forget)
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
    .catch((err) => {
      console.warn('Analytics update failed:', err)
    })

  // Calculate booking window boundaries
  const bookingWindow = buildTeamBookingWindow(eventType, periodType, now)

  return {
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
      seatsPerSlot: eventType.seatsPerSlot ?? 1,
    },
    team: {
      id: team.id,
      name: team.name,
      slug: team.slug,
    },
    bookingWindow,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildTeamBookingWindow(
  eventType: {
    periodStartDate: Date | null
    periodEndDate: Date | null
    periodDays: number | null
  },
  periodType: string,
  now: Date
): { type: string; start: string; end: string | null } {
  let bookingWindowStart: Date = now
  let bookingWindowEnd: Date | null = null

  switch (periodType) {
    case 'RANGE':
      if (eventType.periodStartDate) {
        bookingWindowStart = new Date(eventType.periodStartDate)
        if (bookingWindowStart < now) bookingWindowStart = now
      }
      if (eventType.periodEndDate) {
        bookingWindowEnd = new Date(eventType.periodEndDate)
      }
      break
    case 'ROLLING':
      bookingWindowEnd = addDays(now, eventType.periodDays ?? 30)
      break
    case 'UNLIMITED':
      break
  }

  return {
    type: periodType,
    start: bookingWindowStart.toISOString(),
    end: bookingWindowEnd?.toISOString() ?? null,
  }
}
