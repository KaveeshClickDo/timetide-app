/**
 * User analytics computation: booking stats, time distribution,
 * popular event types, lead time, day-of-week, repeat guests, status.
 *
 * Handles: plan gating, date aggregation, and chart data preparation.
 */

import prisma from '@/server/db/prisma'
import { startOfMonth, endOfMonth, subDays, startOfDay, format } from 'date-fns'
import { PLAN_LIMITS, type PlanTier } from '@/lib/pricing'

// ── Domain errors ─────────────────────────────────────────────────────────────

export class AnalyticsFeatureDeniedError extends Error {
  constructor() {
    super('Analytics requires a higher plan.')
    this.name = 'AnalyticsFeatureDeniedError'
  }
}

// ── Compute analytics ────────────────────────────────────────────────────────

export interface AnalyticsResult {
  stats: {
    totalBookings: number
    thisMonthBookings: number
    totalHours: number
    uniqueGuests: number
    cancellationRate: number
  }
  charts: {
    bookingsOverTime: Array<{ date: string; label: string; bookings: number }>
    popularEventTypes: Array<{ title: string; count: number }>
    bookingTimes: Array<{ hour: number; label: string; bookings: number }>
    statusDistribution: Array<{ status: string; count: number; color: string }>
    leadTime: Array<{ label: string; bookings: number }>
    dayOfWeek: Array<{ day: string; label: string; bookings: number }>
    repeatGuests: Array<{ label: string; guests: number; color: string }>
    topRepeatGuests: Array<{ name: string; email: string; bookings: number }>
  }
}

export async function computeAnalytics(userId: string): Promise<AnalyticsResult> {
  // Plan gating
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  })
  const plan = (dbUser?.plan as PlanTier) || 'FREE'
  if (!PLAN_LIMITS[plan].analytics) throw new AnalyticsFeatureDeniedError()

  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  const allBookings = await prisma.booking.findMany({
    where: { hostId: userId },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
      inviteeName: true,
      inviteeEmail: true,
      createdAt: true,
      eventType: { select: { id: true, title: true, length: true } },
    },
  })

  const totalBookings = allBookings.length
  const thisMonthBookings = allBookings.filter(
    (b) => b.startTime >= monthStart && b.startTime <= monthEnd
  ).length

  // Total hours
  const completedBookings = allBookings.filter(
    (b) =>
      b.status === 'COMPLETED' ||
      ((b.status === 'CONFIRMED' || b.status === 'PENDING') && b.endTime < now)
  )
  const totalMinutes = completedBookings.reduce((acc, b) => {
    return acc + (b.endTime.getTime() - b.startTime.getTime()) / (1000 * 60)
  }, 0)
  const totalHours = Math.round(totalMinutes / 60)

  // Unique guests
  const uniqueEmails = new Set(allBookings.map((b) => b.inviteeEmail.toLowerCase()))
  const uniqueGuests = uniqueEmails.size

  // Bookings over time (last 30 days)
  const bookingsOverTime: Record<string, number> = {}
  for (let i = 29; i >= 0; i--) {
    bookingsOverTime[format(startOfDay(subDays(now, i)), 'yyyy-MM-dd')] = 0
  }
  allBookings.forEach((b) => {
    const dateKey = format(b.createdAt, 'yyyy-MM-dd')
    if (bookingsOverTime[dateKey] !== undefined) bookingsOverTime[dateKey]++
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
      if (!eventTypeCounts[b.eventType.id]) {
        eventTypeCounts[b.eventType.id] = { title: b.eventType.title, count: 0 }
      }
      eventTypeCounts[b.eventType.id].count++
    }
  })
  const popularEventTypes = Object.values(eventTypeCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Hour distribution
  const hourDistribution: number[] = Array(24).fill(0)
  allBookings.forEach((b) => hourDistribution[b.startTime.getHours()]++)
  const bookingTimesData = hourDistribution.map((count, hour) => ({
    hour,
    label: `${hour.toString().padStart(2, '0')}:00`,
    bookings: count,
  }))

  // Lead time
  const leadTimeDistribution = { sameDay: 0, oneToThreeDays: 0, fourToSevenDays: 0, oneToTwoWeeks: 0, moreThanTwoWeeks: 0 }
  allBookings.forEach((b) => {
    const days = (b.startTime.getTime() - b.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    if (days < 1) leadTimeDistribution.sameDay++
    else if (days <= 3) leadTimeDistribution.oneToThreeDays++
    else if (days <= 7) leadTimeDistribution.fourToSevenDays++
    else if (days <= 14) leadTimeDistribution.oneToTwoWeeks++
    else leadTimeDistribution.moreThanTwoWeeks++
  })
  const leadTimeData = [
    { label: 'Same Day', bookings: leadTimeDistribution.sameDay },
    { label: '1-3 Days', bookings: leadTimeDistribution.oneToThreeDays },
    { label: '4-7 Days', bookings: leadTimeDistribution.fourToSevenDays },
    { label: '1-2 Weeks', bookings: leadTimeDistribution.oneToTwoWeeks },
    { label: '2+ Weeks', bookings: leadTimeDistribution.moreThanTwoWeeks },
  ]

  // Day of week
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const dayOfWeekDistribution: number[] = Array(7).fill(0)
  allBookings.forEach((b) => dayOfWeekDistribution[b.startTime.getDay()]++)
  const dayOfWeekData = dayOfWeekDistribution.map((count, i) => ({
    day: dayNames[i],
    label: dayNames[i].slice(0, 3),
    bookings: count,
  }))

  // Repeat guests
  const guestData: Record<string, { name: string; email: string; count: number }> = {}
  allBookings.forEach((b) => {
    const email = b.inviteeEmail.toLowerCase()
    if (!guestData[email]) guestData[email] = { name: b.inviteeName, email: b.inviteeEmail, count: 0 }
    guestData[email].count++
  })

  const repeatGuestsData = { oneTime: 0, twoToThree: 0, fourToFive: 0, sixPlus: 0 }
  Object.values(guestData).forEach(({ count }) => {
    if (count === 1) repeatGuestsData.oneTime++
    else if (count <= 3) repeatGuestsData.twoToThree++
    else if (count <= 5) repeatGuestsData.fourToFive++
    else repeatGuestsData.sixPlus++
  })

  const repeatGuestsChartData = [
    { label: '1 Booking', guests: repeatGuestsData.oneTime, color: '#0ea5e9' },
    { label: '2-3 Bookings', guests: repeatGuestsData.twoToThree, color: '#22c55e' },
    { label: '4-5 Bookings', guests: repeatGuestsData.fourToFive, color: '#f59e0b' },
    { label: '6+ Bookings', guests: repeatGuestsData.sixPlus, color: '#8b5cf6' },
  ].filter((d) => d.guests > 0)

  const topRepeatGuests = Object.values(guestData)
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((g) => ({ name: g.name, email: g.email, bookings: g.count }))

  // Status distribution
  const cancelledCount = allBookings.filter((b) => b.status === 'CANCELLED').length
  const rejectedCount = allBookings.filter((b) => b.status === 'REJECTED').length
  const completedCount = allBookings.filter(
    (b) => b.status === 'COMPLETED' || ((b.status === 'PENDING' || b.status === 'CONFIRMED') && b.endTime < now)
  ).length
  const confirmedCount = allBookings.filter((b) => b.status === 'CONFIRMED' && b.endTime >= now).length
  const pendingCount = allBookings.filter((b) => b.status === 'PENDING' && b.endTime >= now).length

  const statusDistribution = [
    { status: 'Completed', count: completedCount, color: '#22c55e' },
    { status: 'Confirmed', count: confirmedCount, color: '#0ea5e9' },
    { status: 'Pending', count: pendingCount, color: '#f59e0b' },
    { status: 'Cancelled', count: cancelledCount, color: '#ef4444' },
    { status: 'Declined', count: rejectedCount, color: '#6b7280' },
  ].filter((s) => s.count > 0)

  const cancellationRate = totalBookings > 0 ? Math.round((cancelledCount / totalBookings) * 100) : 0

  return {
    stats: { totalBookings, thisMonthBookings, totalHours, uniqueGuests, cancellationRate },
    charts: {
      bookingsOverTime: bookingsOverTimeData,
      popularEventTypes,
      bookingTimes: bookingTimesData,
      statusDistribution,
      leadTime: leadTimeData,
      dayOfWeek: dayOfWeekData,
      repeatGuests: repeatGuestsChartData,
      topRepeatGuests,
    },
  }
}
