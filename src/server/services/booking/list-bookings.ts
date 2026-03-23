/**
 * List bookings for an authenticated user.
 *
 * Supports filtering by status, upcoming/past, and includes bookings
 * where user is host, assigned member, or a collective team member.
 */

import prisma from '@/server/db/prisma'
import { Prisma, BookingStatus } from '@/generated/prisma/client'

export interface ListBookingsParams {
  userId: string
  status?: string | null
  upcoming?: boolean
  past?: boolean
}

export async function listBookings(params: ListBookingsParams) {
  const { userId, status, upcoming, past } = params

  // Include bookings where user is host, assigned member, or a collective team member
  const userFilter: Prisma.BookingWhereInput = {
    OR: [
      { hostId: userId },
      { assignedUserId: userId },
      {
        eventType: {
          teamMemberAssignments: {
            some: {
              isActive: true,
              teamMember: {
                userId: userId,
              },
            },
          },
        },
      },
    ],
  }

  const where: Prisma.BookingWhereInput = { ...userFilter }

  if (status) {
    where.status = status as BookingStatus
  }

  if (upcoming) {
    where.startTime = { gte: new Date() }
    where.status = { in: ['PENDING', 'CONFIRMED'] }
  }

  if (past) {
    where.startTime = { lt: new Date() }
    where.status = { notIn: ['CANCELLED', 'REJECTED', 'SKIPPED'] }
  }

  const bookings = await prisma.booking.findMany({
    where,
    include: {
      eventType: {
        select: {
          id: true,
          title: true,
          length: true,
          locationType: true,
          schedulingType: true,
          team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: { startTime: upcoming ? 'asc' : 'desc' },
    take: 50,
  })

  return bookings
}
