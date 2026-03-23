/**
 * Slot availability validation for booking creation.
 *
 * Verifies the selected host is free, checks group seat capacity,
 * daily booking limits, and minimum notice requirements.
 * Throws domain errors that the route handler translates to HTTP responses.
 */

import { addMinutes, startOfDay } from 'date-fns'
import prisma from '@/server/db/prisma'
import { CALENDAR_FETCH_BUFFER_MINUTES } from '@/server/api-constants'
import { isSlotAvailable, mergeBusyTimes } from '@/server/scheduling/slots/calculator'
import { getAllBusyTimes } from '@/server/integrations/calendar/google'

export class SlotUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SlotUnavailableError'
  }
}

export class MinimumNoticeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MinimumNoticeError'
  }
}

/**
 * Validate that the selected time slot is available for the given host.
 *
 * Checks: calendar busy times, existing bookings, group seat capacity,
 * minimum notice, and daily booking limit.
 *
 * @throws SlotUnavailableError if the slot cannot be booked
 */
export async function validateSlotAvailability(params: {
  hostId: string
  eventTypeId: string
  startDate: Date
  endDate: Date
  bufferTimeBefore: number
  bufferTimeAfter: number
  minimumNotice: number
  maxBookingsPerDay: number | null
  seatsPerSlot: number
}): Promise<void> {
  const {
    hostId,
    eventTypeId,
    startDate,
    endDate,
    bufferTimeBefore,
    bufferTimeAfter,
    minimumNotice,
    maxBookingsPerDay,
    seatsPerSlot,
  } = params

  const isGroupEvent = seatsPerSlot > 1

  // Check calendar busy times
  const calendarBusyTimes = await getAllBusyTimes(
    hostId,
    addMinutes(startDate, -CALENDAR_FETCH_BUFFER_MINUTES),
    addMinutes(endDate, CALENDAR_FETCH_BUFFER_MINUTES)
  )

  // Check ALL bookings for this host (across all event types)
  const existingBookings = await prisma.booking.findMany({
    where: {
      OR: [
        { hostId },
        { assignedUserId: hostId },
        { attendees: { some: { userId: hostId } } },
      ],
      status: { in: ['PENDING', 'CONFIRMED'] },
      startTime: { lt: endDate },
      endTime: { gt: startDate },
    },
  })

  // For group events: check seat capacity separately
  if (isGroupEvent) {
    const slotBookingCount = await prisma.booking.count({
      where: {
        eventTypeId,
        startTime: startDate,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
    })

    if (slotBookingCount >= seatsPerSlot) {
      throw new SlotUnavailableError('All seats for this time slot are taken. Please select another time.')
    }
  }

  // Build busy times: for group events, exclude this event type's bookings
  // (they don't block the host since multiple people share the same slot)
  const bookingBusyTimes = existingBookings
    .filter((b) => !isGroupEvent || b.eventTypeId !== eventTypeId)
    .map((b) => ({
      start: b.startTime,
      end: b.endTime,
    }))

  const allBusyTimes = mergeBusyTimes([
    ...calendarBusyTimes,
    ...bookingBusyTimes,
  ])

  const slotAvailable = isSlotAvailable(
    { start: startDate, end: endDate },
    allBusyTimes,
    bufferTimeBefore,
    bufferTimeAfter
  )

  if (!slotAvailable) {
    throw new SlotUnavailableError('This time slot is no longer available. Please select another time.')
  }

  // Check minimum notice
  const minimumNoticeTime = addMinutes(new Date(), minimumNotice)
  if (startDate < minimumNoticeTime) {
    throw new MinimumNoticeError('This time slot is too soon. Please select a later time.')
  }

  // Check daily booking limit
  if (maxBookingsPerDay) {
    const dayStart = startOfDay(startDate)
    const dayEnd = addMinutes(dayStart, 24 * 60)

    const dayBookings = await prisma.booking.count({
      where: {
        eventTypeId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startTime: { gte: dayStart, lt: dayEnd },
      },
    })

    if (dayBookings >= maxBookingsPerDay) {
      throw new SlotUnavailableError('No more bookings available for this day.')
    }
  }
}
