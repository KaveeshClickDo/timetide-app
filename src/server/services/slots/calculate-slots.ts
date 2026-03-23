/**
 * Calculate available time slots for an individual event type.
 *
 * Handles: event type lookup, period type logic (ROLLING/RANGE/UNLIMITED),
 * busy time aggregation (calendar + bookings), group event seat tracking,
 * slot calculation, booking window boundaries, and analytics tracking.
 */

import { addDays, parseISO, startOfDay } from 'date-fns'
import prisma from '@/server/db/prisma'
import {
  SlotCalculator,
  mergeBusyTimes,
} from '@/server/scheduling/slots/calculator'
import { getAllBusyTimes } from '@/server/integrations/calendar/google'

// ── Domain errors ─────────────────────────────────────────────────────────────

export class SlotsEventTypeNotFoundError extends Error {
  constructor() {
    super('Event type not found')
    this.name = 'SlotsEventTypeNotFoundError'
  }
}

export class SlotsNoScheduleError extends Error {
  constructor() {
    super('No availability schedule configured')
    this.name = 'SlotsNoScheduleError'
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CalculateSlotsParams {
  eventTypeId: string
  startDate?: string | null
  endDate?: string | null
  timezone: string
}

export interface CalculateSlotsResult {
  slots: Record<string, Array<{ start: Date; end: Date; seatsRemaining?: number }>>
  eventType: {
    id: string
    title: string
    duration: number
    timezone: string | null
    seatsPerSlot: number
  }
  bookingWindow: {
    type: string | null
    start: string
    end: string | null
  }
  /** Set when no schedule is configured — still returns empty slots */
  message?: string
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function calculateSlots(
  params: CalculateSlotsParams
): Promise<CalculateSlotsResult> {
  const { eventTypeId, startDate, endDate, timezone } = params

  // Fetch event type with schedule and user
  const eventType = await prisma.eventType.findUnique({
    where: { id: eventTypeId, isActive: true, lockedByDowngrade: false },
    include: {
      user: { select: { id: true, timezone: true } },
      schedule: {
        include: {
          slots: true,
          overrides: true,
        },
      },
    },
  })

  if (!eventType) {
    throw new SlotsEventTypeNotFoundError()
  }

  // Determine date range based on period type
  const now = new Date()
  let rangeStart = startDate ? parseISO(startDate) : now
  let rangeEnd: Date
  let maxDays: number

  switch (eventType.periodType) {
    case 'RANGE': {
      const periodStart = eventType.periodStartDate ? new Date(eventType.periodStartDate) : now
      let periodEnd = eventType.periodEndDate ? new Date(eventType.periodEndDate) : addDays(now, 30)
      const tenYearsFromNow = addDays(now, 365 * 10)
      if (periodEnd > tenYearsFromNow) periodEnd = tenYearsFromNow

      if (rangeStart < periodStart) rangeStart = periodStart
      if (rangeStart < now) rangeStart = now

      rangeEnd = endDate ? parseISO(endDate) : periodEnd
      if (rangeEnd > periodEnd) rangeEnd = periodEnd

      maxDays = Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
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

      const rollingLimit = addDays(now, maxDays)
      if (rangeEnd > rollingLimit) rangeEnd = rollingLimit
      break
  }

  // Fetch ALL bookings for this host (across all event types)
  const allHostBookings = await prisma.booking.findMany({
    where: {
      OR: [
        { hostId: eventType.userId },
        { assignedUserId: eventType.userId },
        { attendees: { some: { userId: eventType.userId } } },
      ],
      status: { in: ['PENDING', 'CONFIRMED'] },
      endTime: { gte: now },
    },
    select: {
      startTime: true,
      endTime: true,
      eventTypeId: true,
    },
  })

  // Get busy times from connected calendars
  let calendarBusyTimes: { start: Date; end: Date }[] = []
  try {
    calendarBusyTimes = await getAllBusyTimes(
      eventType.userId,
      rangeStart,
      addDays(rangeEnd, 1)
    )
  } catch (calendarError) {
    console.warn('Could not fetch calendar busy times:', calendarError)
  }

  // Handle group events (seatsPerSlot > 1)
  const isGroupEvent = (eventType.seatsPerSlot ?? 1) > 1
  const seatsPerSlot = eventType.seatsPerSlot ?? 1
  const slotBookingCounts = new Map<string, number>()

  let bookingBusyTimes: { start: Date; end: Date }[]
  if (isGroupEvent) {
    const otherEventBookings: { start: Date; end: Date }[] = []

    for (const b of allHostBookings) {
      if (b.eventTypeId === eventTypeId) {
        const slotKey = b.startTime.toISOString()
        slotBookingCounts.set(slotKey, (slotBookingCounts.get(slotKey) ?? 0) + 1)
      } else {
        otherEventBookings.push({ start: b.startTime, end: b.endTime })
      }
    }

    const fullyBookedSlots: { start: Date; end: Date }[] = []
    for (const b of allHostBookings) {
      if (b.eventTypeId === eventTypeId) {
        const slotKey = b.startTime.toISOString()
        const count = slotBookingCounts.get(slotKey) ?? 0
        if (count >= seatsPerSlot) {
          fullyBookedSlots.push({ start: b.startTime, end: b.endTime })
        }
      }
    }

    bookingBusyTimes = [...otherEventBookings, ...fullyBookedSlots]
  } else {
    bookingBusyTimes = allHostBookings.map((b) => ({
      start: b.startTime,
      end: b.endTime,
    }))
  }

  // Merge all busy times
  const allBusyTimes = mergeBusyTimes([...calendarBusyTimes, ...bookingBusyTimes])

  // Check schedule
  const schedule = eventType.schedule
  if (!schedule || !schedule.slots || schedule.slots.length === 0) {
    console.warn(`Event type ${eventTypeId} has no availability schedule configured`)
    return {
      slots: {},
      eventType: {
        id: eventType.id,
        title: eventType.title,
        duration: eventType.length,
        timezone: eventType.user.timezone,
        seatsPerSlot,
      },
      bookingWindow: buildBookingWindow(eventType, now),
      message: 'No availability schedule configured',
    }
  }

  const availability = schedule.slots.map((s) => ({
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
  }))

  const dateOverrides =
    schedule.overrides?.map((o) => ({
      date: o.date,
      isWorking: o.isWorking,
      startTime: o.startTime ?? undefined,
      endTime: o.endTime ?? undefined,
    })) ?? []

  // Fetch bookings for maxBookingsPerDay check
  const eventTypeBookings = await prisma.booking.findMany({
    where: {
      eventTypeId,
      status: { in: ['PENDING', 'CONFIRMED'] },
      endTime: { gte: now },
    },
    select: { startTime: true },
  })

  const bookingsPerDay = new Map<string, number>()
  for (const booking of eventTypeBookings) {
    const dateKey = booking.startTime.toISOString().split('T')[0]
    bookingsPerDay.set(dateKey, (bookingsPerDay.get(dateKey) ?? 0) + 1)
  }

  // Calculate slots
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
  })

  const calculatedSlots = calculator.calculate(rangeStart, rangeEnd)

  // For group events, enrich slots with remaining seat counts
  let slots: Record<string, Array<{ start: Date; end: Date; seatsRemaining?: number }>>
  if (isGroupEvent) {
    slots = {}
    for (const [dateKey, daySlots] of Object.entries(calculatedSlots)) {
      slots[dateKey] = daySlots.map((slot) => {
        const slotKey = slot.start.toISOString()
        const booked = slotBookingCounts.get(slotKey) ?? 0
        return {
          ...slot,
          seatsRemaining: seatsPerSlot - booked,
        }
      })
    }
  } else {
    slots = calculatedSlots
  }

  // Track analytics (fire and forget)
  prisma.bookingAnalytics
    .upsert({
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
    })
    .catch((err) => {
      console.warn('Analytics update failed:', err)
    })

  return {
    slots,
    eventType: {
      id: eventType.id,
      title: eventType.title,
      duration: eventType.length,
      timezone: eventType.user.timezone,
      seatsPerSlot,
    },
    bookingWindow: buildBookingWindow(eventType, now),
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildBookingWindow(
  eventType: {
    periodType: string | null
    periodStartDate: Date | null
    periodEndDate: Date | null
    periodDays: number | null
  },
  now: Date
): { type: string | null; start: string; end: string | null } {
  let bookingWindowStart: Date = now
  let bookingWindowEnd: Date | null = null

  switch (eventType.periodType) {
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
    type: eventType.periodType,
    start: bookingWindowStart.toISOString(),
    end: bookingWindowEnd?.toISOString() ?? null,
  }
}
