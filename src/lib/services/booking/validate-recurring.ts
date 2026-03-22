/**
 * Recurring slot validation for booking creation.
 *
 * Validates that all future occurrences of a recurring booking fit within
 * the booking window, have available slots, and don't exceed daily limits.
 * Throws domain errors that the route handler translates to HTTP responses.
 */

import { addMinutes, startOfDay } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import prisma from '@/lib/prisma'
import { isSlotAvailable, mergeBusyTimes } from '@/lib/scheduling/slots/calculator'
import { getAllBusyTimes } from '@/lib/integrations/calendar/google'

export class RecurringSlotError extends Error {
  public conflictWeek: number

  constructor(message: string, conflictWeek: number) {
    super(message)
    this.name = 'RecurringSlotError'
    this.conflictWeek = conflictWeek
  }
}

/**
 * Validate all future occurrences of a recurring booking (skipping occurrence 0,
 * which is validated by the primary slot check).
 *
 * @throws RecurringSlotError with conflictWeek if an occurrence is unavailable
 */
export async function validateRecurringSlots(params: {
  hostId: string
  eventTypeId: string
  allOccurrenceDates: Date[]
  eventLength: number
  timezone: string
  bufferTimeBefore: number
  bufferTimeAfter: number
  maxBookingsPerDay: number | null
  seatsPerSlot: number
}): Promise<void> {
  const {
    hostId,
    eventTypeId,
    allOccurrenceDates,
    eventLength,
    timezone,
    bufferTimeBefore,
    bufferTimeAfter,
    maxBookingsPerDay,
    seatsPerSlot,
  } = params

  const isGroupEvent = seatsPerSlot > 1
  const occurrenceCount = allOccurrenceDates.length

  // Validate occurrences 1..N (occurrence 0 is the primary slot, already validated)
  for (let i = 1; i < occurrenceCount; i++) {
    const occStart = allOccurrenceDates[i]
    const occEnd = addMinutes(occStart, eventLength)

    // Check availability for this occurrence
    const occBusyTimes = await getAllBusyTimes(
      hostId,
      addMinutes(occStart, -60),
      addMinutes(occEnd, 60)
    )

    const occBookings = await prisma.booking.findMany({
      where: {
        hostId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startTime: { lt: occEnd },
        endTime: { gt: occStart },
      },
    })

    const occBookingBusy = occBookings
      .filter((b) => !isGroupEvent || b.eventTypeId !== eventTypeId)
      .map((b) => ({ start: b.startTime, end: b.endTime }))

    const occAllBusy = mergeBusyTimes([...occBusyTimes, ...occBookingBusy])
    const occAvailable = isSlotAvailable(
      { start: occStart, end: occEnd },
      occAllBusy,
      bufferTimeBefore,
      bufferTimeAfter
    )

    if (!occAvailable) {
      throw new RecurringSlotError(
        `The time slot on ${formatInTimeZone(occStart, timezone, 'EEEE, MMMM d, yyyy')} (week ${i + 1}) is not available. Please choose a different time.`,
        i + 1
      )
    }

    // Check daily booking limit for this occurrence
    if (maxBookingsPerDay) {
      const occDayStart = startOfDay(occStart)
      const occDayEnd = addMinutes(occDayStart, 24 * 60)
      const occDayBookings = await prisma.booking.count({
        where: {
          eventTypeId,
          status: { in: ['PENDING', 'CONFIRMED'] },
          startTime: { gte: occDayStart, lt: occDayEnd },
        },
      })
      if (occDayBookings >= maxBookingsPerDay) {
        throw new RecurringSlotError(
          `No more bookings available on ${formatInTimeZone(occStart, timezone, 'EEEE, MMMM d, yyyy')} (week ${i + 1}).`,
          i + 1
        )
      }
    }
  }
}
