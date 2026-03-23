import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/server/db/prisma'
import { requireAdmin } from '@/server/auth/admin-auth'
import { MAX_ANALYTICS_DAYS } from '@/server/api-constants'

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const { searchParams } = req.nextUrl
    const days = Math.min(Math.max(1, parseInt(searchParams.get('days') || '30')), MAX_ANALYTICS_DAYS)
    const since = new Date()
    since.setDate(since.getDate() - days)

    const [
      users,
      bookings,
      planDistribution,
      topEventTypes,
      calendarProviders,
    ] = await Promise.all([
      // Signups over time
      prisma.user.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      // Bookings over time
      prisma.booking.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      // Plan distribution
      prisma.user.groupBy({ by: ['plan'], _count: { plan: true } }),
      // Top event types by bookings
      prisma.eventType.findMany({
        select: {
          title: true,
          _count: { select: { bookings: true } },
          user: { select: { name: true, email: true } },
        },
        orderBy: { bookings: { _count: 'desc' } },
        take: 10,
      }),
      // Calendar providers
      prisma.calendar.groupBy({ by: ['provider'], _count: { provider: true } }),
    ])

    // Aggregate signups by date
    const signupMap = new Map<string, number>()
    users.forEach((u) => {
      const date = u.createdAt.toISOString().split('T')[0]
      signupMap.set(date, (signupMap.get(date) || 0) + 1)
    })
    const signupTrends = Array.from(signupMap.entries()).map(([date, count]) => ({ date, count }))

    // Aggregate bookings by date
    const bookingMap = new Map<string, number>()
    bookings.forEach((b) => {
      const date = b.createdAt.toISOString().split('T')[0]
      bookingMap.set(date, (bookingMap.get(date) || 0) + 1)
    })
    const bookingTrends = Array.from(bookingMap.entries()).map(([date, count]) => ({ date, count }))

    return NextResponse.json({
      signupTrends,
      bookingTrends,
      planDistribution: planDistribution.map((p) => ({ plan: p.plan, count: p._count.plan })),
      topEventTypes: topEventTypes.map((et) => ({
        title: et.title,
        bookings: et._count.bookings,
        host: et.user.name || et.user.email,
      })),
      calendarProviders: calendarProviders.map((c) => ({ provider: c.provider, count: c._count.provider })),
    })
  } catch (error) {
    console.error('Admin analytics error:', error)
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
}
