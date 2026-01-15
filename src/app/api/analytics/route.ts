import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { startOfMonth, endOfMonth, subDays, startOfDay, format } from 'date-fns'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const now = new Date()
    const thirtyDaysAgo = subDays(now, 30)
    const monthStart = startOfMonth(now)
    const monthEnd = endOfMonth(now)

    // Get all bookings for this user
    const allBookings = await prisma.booking.findMany({
      where: { hostId: userId },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        status: true,
        inviteeEmail: true,
        createdAt: true,
        eventType: {
          select: {
            id: true,
            title: true,
            length: true,
          },
        },
      },
    })

    // Calculate stats
    const totalBookings = allBookings.length

    const thisMonthBookings = allBookings.filter(
      (b) => b.startTime >= monthStart && b.startTime <= monthEnd
    ).length

    // Calculate total hours booked (confirmed + completed bookings only)
    const completedBookings = allBookings.filter(
      (b) => b.status === 'CONFIRMED' || b.status === 'COMPLETED'
    )
    const totalMinutes = completedBookings.reduce((acc, b) => {
      const duration = (b.endTime.getTime() - b.startTime.getTime()) / (1000 * 60)
      return acc + duration
    }, 0)
    const totalHours = Math.round(totalMinutes / 60)

    // Unique guests (by email)
    const uniqueEmails = new Set(allBookings.map((b) => b.inviteeEmail.toLowerCase()))
    const uniqueGuests = uniqueEmails.size

    // Bookings over time (last 30 days)
    const bookingsOverTime: Record<string, number> = {}
    for (let i = 29; i >= 0; i--) {
      const date = startOfDay(subDays(now, i))
      const dateKey = format(date, 'yyyy-MM-dd')
      bookingsOverTime[dateKey] = 0
    }

    allBookings.forEach((b) => {
      const dateKey = format(b.createdAt, 'yyyy-MM-dd')
      if (bookingsOverTime[dateKey] !== undefined) {
        bookingsOverTime[dateKey]++
      }
    })

    const bookingsOverTimeData = Object.entries(bookingsOverTime).map(([date, count]) => ({
      date,
      label: format(new Date(date), 'MMM d'),
      bookings: count,
    }))

    // Popular event types
    const eventTypeCounts: Record<string, { title: string; count: number }> = {}
    allBookings.forEach((b) => {
      if (b.eventType) {
        const id = b.eventType.id
        if (!eventTypeCounts[id]) {
          eventTypeCounts[id] = { title: b.eventType.title, count: 0 }
        }
        eventTypeCounts[id].count++
      }
    })

    const popularEventTypes = Object.values(eventTypeCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Booking times (hour of day distribution)
    const hourDistribution: number[] = Array(24).fill(0)
    allBookings.forEach((b) => {
      const hour = b.startTime.getHours()
      hourDistribution[hour]++
    })

    const bookingTimesData = hourDistribution.map((count, hour) => ({
      hour,
      label: `${hour.toString().padStart(2, '0')}:00`,
      bookings: count,
    }))

    // Cancellation rate
    const cancelledBookings = allBookings.filter((b) => b.status === 'CANCELLED').length
    const completedCount = allBookings.filter(
      (b) => b.status === 'CONFIRMED' || b.status === 'COMPLETED'
    ).length
    const pendingCount = allBookings.filter((b) => b.status === 'PENDING').length
    const rejectedCount = allBookings.filter((b) => b.status === 'REJECTED').length

    const statusDistribution = [
      { status: 'Completed', count: completedCount, color: '#22c55e' },
      { status: 'Pending', count: pendingCount, color: '#f59e0b' },
      { status: 'Cancelled', count: cancelledBookings, color: '#ef4444' },
      { status: 'Rejected', count: rejectedCount, color: '#6b7280' },
    ].filter((s) => s.count > 0)

    const cancellationRate = totalBookings > 0
      ? Math.round((cancelledBookings / totalBookings) * 100)
      : 0

    return NextResponse.json({
      stats: {
        totalBookings,
        thisMonthBookings,
        totalHours,
        uniqueGuests,
        cancellationRate,
      },
      charts: {
        bookingsOverTime: bookingsOverTimeData,
        popularEventTypes,
        bookingTimes: bookingTimesData,
        statusDistribution,
      },
    })
  } catch (error) {
    console.error('Analytics error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
