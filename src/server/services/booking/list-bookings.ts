/**
 * List bookings for an authenticated user.
 *
 * Supports filtering by status, upcoming/past, and includes bookings
 * where user is host, assigned member, or a collective team member.
 */

import prisma from '@/server/db/prisma'
import { Prisma, BookingStatus } from '@/generated/prisma/client'
import { DEFAULT_PAGE_SIZE } from '@/server/api-constants'

export interface ListBookingsParams {
  userId: string
  status?: string | null
  upcoming?: boolean
  past?: boolean
  page?: number
  pageSize?: number
}

export interface BookingStats {
  upcoming: number
  completed: number
  cancelled: number
  declined: number
}

function buildBookingsWhere(params: ListBookingsParams): Prisma.BookingWhereInput {
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

  return where
}

const bookingInclude = {
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
} as const

export async function listBookings(params: ListBookingsParams) {
  const { upcoming, page = 1, pageSize = DEFAULT_PAGE_SIZE } = params
  const where = buildBookingsWhere(params)

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: bookingInclude,
      orderBy: { startTime: upcoming ? 'asc' : 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.booking.count({ where }),
  ])

  return { bookings, total, page, pageSize }
}

export async function getBookingStats(userId: string): Promise<BookingStats> {
  const now = new Date()

  const userFilter: Prisma.BookingWhereInput = {
    OR: [
      { hostId: userId },
      { assignedUserId: userId },
      {
        eventType: {
          teamMemberAssignments: {
            some: {
              isActive: true,
              teamMember: { userId },
            },
          },
        },
      },
    ],
  }

  const [upcoming, completed, cancelled, declined] = await Promise.all([
    prisma.booking.count({
      where: { ...userFilter, startTime: { gte: now }, status: { in: ['PENDING', 'CONFIRMED'] } },
    }),
    prisma.booking.count({
      where: { ...userFilter, OR: [{ status: 'COMPLETED' }, { status: { in: ['PENDING', 'CONFIRMED'] }, endTime: { lt: now } }] },
    }),
    prisma.booking.count({
      where: { ...userFilter, status: 'CANCELLED' },
    }),
    prisma.booking.count({
      where: { ...userFilter, status: 'REJECTED' },
    }),
  ])

  return { upcoming, completed, cancelled, declined }
}
