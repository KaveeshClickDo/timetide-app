import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { startOfMonth, endOfMonth, subDays, startOfDay, format } from 'date-fns'
import { checkFeatureAccess } from '@/lib/plan-enforcement'
import type { PlanTier } from '@/lib/pricing'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Enforce analytics feature gate
    const plan = (session.user as any).plan as PlanTier
    const featureDenied = checkFeatureAccess(plan, 'analytics')
    if (featureDenied) return featureDenied

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

    // Calculate total hours booked (past confirmed/completed bookings only)
    const completedBookings = allBookings.filter(
      (b) => b.status === 'COMPLETED' ||
      ((b.status === 'CONFIRMED' || b.status === 'PENDING') && b.endTime < now)
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

    // Booking Lead Time (how far in advance people book)
    const leadTimeDistribution = {
      sameDay: 0,
      oneToThreeDays: 0,
      fourToSevenDays: 0,
      oneToTwoWeeks: 0,
      moreThanTwoWeeks: 0,
    }

    allBookings.forEach((b) => {
      const leadTimeMs = b.startTime.getTime() - b.createdAt.getTime()
      const leadTimeDays = leadTimeMs / (1000 * 60 * 60 * 24)

      if (leadTimeDays < 1) {
        leadTimeDistribution.sameDay++
      } else if (leadTimeDays <= 3) {
        leadTimeDistribution.oneToThreeDays++
      } else if (leadTimeDays <= 7) {
        leadTimeDistribution.fourToSevenDays++
      } else if (leadTimeDays <= 14) {
        leadTimeDistribution.oneToTwoWeeks++
      } else {
        leadTimeDistribution.moreThanTwoWeeks++
      }
    })

    const leadTimeData = [
      { label: 'Same Day', bookings: leadTimeDistribution.sameDay },
      { label: '1-3 Days', bookings: leadTimeDistribution.oneToThreeDays },
      { label: '4-7 Days', bookings: leadTimeDistribution.fourToSevenDays },
      { label: '1-2 Weeks', bookings: leadTimeDistribution.oneToTwoWeeks },
      { label: '2+ Weeks', bookings: leadTimeDistribution.moreThanTwoWeeks },
    ]

    // Day of Week Distribution
    const dayOfWeekDistribution: number[] = Array(7).fill(0)
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

    allBookings.forEach((b) => {
      const dayOfWeek = b.startTime.getDay()
      dayOfWeekDistribution[dayOfWeek]++
    })

    const dayOfWeekData = dayOfWeekDistribution.map((count, index) => ({
      day: dayNames[index],
      label: dayNames[index].slice(0, 3),
      bookings: count,
    }))

    // Repeat Guests
    const guestBookingCounts: Record<string, number> = {}
    allBookings.forEach((b) => {
      const email = b.inviteeEmail.toLowerCase()
      guestBookingCounts[email] = (guestBookingCounts[email] || 0) + 1
    })

    const repeatGuestsData = {
      oneTime: 0,
      twoToThree: 0,
      fourToFive: 0,
      sixPlus: 0,
    }

    Object.values(guestBookingCounts).forEach((count) => {
      if (count === 1) {
        repeatGuestsData.oneTime++
      } else if (count <= 3) {
        repeatGuestsData.twoToThree++
      } else if (count <= 5) {
        repeatGuestsData.fourToFive++
      } else {
        repeatGuestsData.sixPlus++
      }
    })

    const repeatGuestsChartData = [
      { label: '1 Booking', guests: repeatGuestsData.oneTime, color: '#0ea5e9' },
      { label: '2-3 Bookings', guests: repeatGuestsData.twoToThree, color: '#22c55e' },
      { label: '4-5 Bookings', guests: repeatGuestsData.fourToFive, color: '#f59e0b' },
      { label: '6+ Bookings', guests: repeatGuestsData.sixPlus, color: '#8b5cf6' },
    ].filter((d) => d.guests > 0)

    // Status distribution (time-aware, matching dashboard logic)
    const cancelledCount = allBookings.filter((b) => b.status === 'CANCELLED').length
    const rejectedCount = allBookings.filter((b) => b.status === 'REJECTED').length

    // Completed = COMPLETED status OR (PENDING/CONFIRMED) with past end time
    const completedCount = allBookings.filter(
      (b) => b.status === 'COMPLETED' ||
      ((b.status === 'PENDING' || b.status === 'CONFIRMED') && b.endTime < now)
    ).length

    // Confirmed = CONFIRMED with future end time
    const confirmedCount = allBookings.filter(
      (b) => b.status === 'CONFIRMED' && b.endTime >= now
    ).length

    // Pending = PENDING with future end time
    const pendingCount = allBookings.filter(
      (b) => b.status === 'PENDING' && b.endTime >= now
    ).length

    const statusDistribution = [
      { status: 'Completed', count: completedCount, color: '#22c55e' },
      { status: 'Confirmed', count: confirmedCount, color: '#0ea5e9' },
      { status: 'Pending', count: pendingCount, color: '#f59e0b' },
      { status: 'Cancelled', count: cancelledCount, color: '#ef4444' },
      { status: 'Declined', count: rejectedCount, color: '#6b7280' },
    ].filter((s) => s.count > 0)

    const cancellationRate = totalBookings > 0
      ? Math.round((cancelledCount / totalBookings) * 100)
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
        leadTime: leadTimeData,
        dayOfWeek: dayOfWeekData,
        repeatGuests: repeatGuestsChartData,
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
