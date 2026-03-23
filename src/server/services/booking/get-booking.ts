/**
 * Get booking details by ID or UID.
 *
 * Returns booking with event type, host, assigned user, and recurring siblings.
 * Masks sensitive info for non-host viewers.
 */

import prisma from '@/server/db/prisma'

export class BookingNotFoundError extends Error {
  constructor() {
    super('Booking not found')
    this.name = 'BookingNotFoundError'
  }
}

export class BookingUnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'BookingUnauthorizedError'
  }
}

export interface GetBookingParams {
  /** Booking ID or UID */
  id: string
  /** Session user ID (null if unauthenticated) */
  sessionUserId?: string | null
}

export async function getBookingDetails(params: GetBookingParams) {
  const { id, sessionUserId } = params

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
          slug: true,
          description: true,
          length: true,
          locationType: true,
          locationValue: true,
          schedulingType: true,
          teamId: true,
          team: {
            select: { slug: true },
          },
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
  })

  if (!booking) {
    throw new BookingNotFoundError()
  }

  // Also fetch assigned user if exists
  let assignedUser = null
  if (booking.assignedUserId) {
    assignedUser = await prisma.user.findUnique({
      where: { id: booking.assignedUserId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
    })
  }

  // Check authorization - host can always access, others need the UID
  const isHost = sessionUserId === booking.hostId
  const accessedByUid = id === booking.uid

  if (!isHost && !accessedByUid) {
    throw new BookingUnauthorizedError()
  }

  // Fetch recurring siblings if this is a recurring booking
  let recurringBookings = null
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
    })
  }

  // Mask sensitive info for non-hosts
  return {
    ...booking,
    assignedUser: isHost ? assignedUser : null,
    host: isHost
      ? booking.host
      : {
          name: booking.host.name,
          image: booking.host.image,
        },
    eventType: booking.eventType,
    recurringBookings,
  }
}
