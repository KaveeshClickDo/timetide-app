/**
 * User analytics computation: booking stats, time distribution,
 * popular event types, lead time, day-of-week, repeat guests, status.
 *
 * Handles: plan gating, date aggregation, and chart data preparation.
 *
 * Uses targeted DB queries (count, groupBy) instead of loading all
 * bookings into memory. Only date-math charts (hour, dayOfWeek,
 * leadTime) fetch rows, scoped to the last 90 days.
 */

import prisma from '@/server/db/prisma'
import { startOfMonth, endOfMonth, subDays, startOfDay, format } from 'date-fns'
import { PLAN_LIMITS, type PlanTier } from '@/lib/pricing'
import { ANALYTICS_CHART_DAYS } from '@/server/api-constants'

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
  const thirtyDaysAgo = startOfDay(subDays(now, 29))
  const chartCutoff = startOfDay(subDays(now, ANALYTICS_CHART_DAYS - 1))
  const hostFilter = { hostId: userId }

  // ── Batch 1: All independent queries in parallel ─────────────────────────

  const [
    totalBookings,
    thisMonthBookings,
    cancelledCount,
    rejectedCount,
    completedCount,
    futureConfirmedCount,
    futurePendingCount,
    eventTypeGroups,
    guestGroups,
    completedForHours,
    last30DaysBookings,
    chartBookings,
  ] = await Promise.all([
    // 1. Total bookings (all-time)
    prisma.booking.count({ where: hostFilter }),

    // 2. This month bookings
    prisma.booking.count({
      where: { ...hostFilter, startTime: { gte: monthStart, lte: monthEnd } },
    }),

    // 3. Cancelled count
    prisma.booking.count({
      where: { ...hostFilter, status: 'CANCELLED' },
    }),

    // 4. Rejected count
    prisma.booking.count({
      where: { ...hostFilter, status: 'REJECTED' },
    }),

    // 5. Completed: explicitly completed + past pending/confirmed
    prisma.booking.count({
      where: {
        ...hostFilter,
        OR: [
          { status: 'COMPLETED' },
          { status: { in: ['PENDING', 'CONFIRMED'] }, endTime: { lt: now } },
        ],
      },
    }),

    // 6. Future confirmed (not yet ended)
    prisma.booking.count({
      where: { ...hostFilter, status: 'CONFIRMED', endTime: { gte: now } },
    }),

    // 7. Future pending (not yet ended)
    prisma.booking.count({
      where: { ...hostFilter, status: 'PENDING', endTime: { gte: now } },
    }),

    // 8. Popular event types (groupBy)
    prisma.booking.groupBy({
      by: ['eventTypeId'],
      where: hostFilter,
      _count: { eventTypeId: true },
      orderBy: { _count: { eventTypeId: 'desc' } },
      take: 5,
    }),

    // 9. Guest frequency (groupBy for unique guests + repeat guest bucketing)
    prisma.booking.groupBy({
      by: ['inviteeEmail'],
      where: hostFilter,
      _count: { inviteeEmail: true },
    }),

    // 10. Completed bookings for total hours (minimal select)
    prisma.booking.findMany({
      where: {
        ...hostFilter,
        OR: [
          { status: 'COMPLETED' },
          { status: { in: ['CONFIRMED', 'PENDING'] }, endTime: { lt: now } },
        ],
      },
      select: { startTime: true, endTime: true },
    }),

    // 11. Last 30 days bookings for bookingsOverTime chart
    prisma.booking.findMany({
      where: { ...hostFilter, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    }),

    // 12. Last 90 days bookings for hour/dayOfWeek/leadTime charts
    prisma.booking.findMany({
      where: { ...hostFilter, startTime: { gte: chartCutoff } },
      select: { startTime: true, createdAt: true },
    }),
  ])

  // ── Total hours ──────────────────────────────────────────────────────────

  const totalMinutes = completedForHours.reduce((acc, b) => {
    return acc + (b.endTime.getTime() - b.startTime.getTime()) / (1000 * 60)
  }, 0)
  const totalHours = Math.round(totalMinutes / 60)

  // ── Unique guests + cancellation rate ────────────────────────────────────

  const uniqueGuests = guestGroups.length
  const cancellationRate = totalBookings > 0
    ? Math.round((cancelledCount / totalBookings) * 100)
    : 0

  // ── Bookings over time (last 30 days) ────────────────────────────────────

  const bookingsOverTime: Record<string, number> = {}
  for (let i = 29; i >= 0; i--) {
    bookingsOverTime[format(startOfDay(subDays(now, i)), 'yyyy-MM-dd')] = 0
  }
  last30DaysBookings.forEach((b) => {
    const dateKey = format(b.createdAt, 'yyyy-MM-dd')
    if (bookingsOverTime[dateKey] !== undefined) bookingsOverTime[dateKey]++
  })
  const bookingsOverTimeData = Object.entries(bookingsOverTime).map(([date, count]) => ({
    date,
    label: format(new Date(date), 'MMM d'),
    bookings: count,
  }))

  // ── Popular event types ──────────────────────────────────────────────────

  const topEventTypeIds = eventTypeGroups
    .filter((g) => g.eventTypeId !== null)
    .map((g) => g.eventTypeId as string)

  let popularEventTypes: Array<{ title: string; count: number }> = []
  if (topEventTypeIds.length > 0) {
    const eventTypes = await prisma.eventType.findMany({
      where: { id: { in: topEventTypeIds } },
      select: { id: true, title: true },
    })
    const titleMap = new Map(eventTypes.map((et) => [et.id, et.title]))
    popularEventTypes = eventTypeGroups
      .filter((g) => g.eventTypeId !== null)
      .map((g) => ({
        title: titleMap.get(g.eventTypeId as string) || 'Unknown',
        count: g._count.eventTypeId,
      }))
  }

  // ── Hour distribution (last 90 days) ─────────────────────────────────────

  const hourDistribution: number[] = Array(24).fill(0)
  chartBookings.forEach((b) => hourDistribution[b.startTime.getHours()]++)
  const bookingTimesData = hourDistribution.map((count, hour) => ({
    hour,
    label: `${hour.toString().padStart(2, '0')}:00`,
    bookings: count,
  }))

  // ── Lead time (last 90 days) ─────────────────────────────────────────────

  const leadTimeDistribution = { sameDay: 0, oneToThreeDays: 0, fourToSevenDays: 0, oneToTwoWeeks: 0, moreThanTwoWeeks: 0 }
  chartBookings.forEach((b) => {
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

  // ── Day of week (last 90 days) ───────────────────────────────────────────

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const dayOfWeekDistribution: number[] = Array(7).fill(0)
  chartBookings.forEach((b) => dayOfWeekDistribution[b.startTime.getDay()]++)
  const dayOfWeekData = dayOfWeekDistribution.map((count, i) => ({
    day: dayNames[i],
    label: dayNames[i].slice(0, 3),
    bookings: count,
  }))

  // ── Repeat guests (all-time, DB-aggregated) ──────────────────────────────

  const repeatGuestsData = { oneTime: 0, twoToThree: 0, fourToFive: 0, sixPlus: 0 }
  guestGroups.forEach(({ _count }) => {
    const count = _count.inviteeEmail
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

  // Top repeat guests — fetch names for the top 10 emails
  const topGuestEmails = guestGroups
    .filter((g) => g._count.inviteeEmail >= 2)
    .sort((a, b) => b._count.inviteeEmail - a._count.inviteeEmail)
    .slice(0, 10)

  let topRepeatGuests: Array<{ name: string; email: string; bookings: number }> = []
  if (topGuestEmails.length > 0) {
    const guestNames = await prisma.booking.findMany({
      where: {
        ...hostFilter,
        inviteeEmail: { in: topGuestEmails.map((g) => g.inviteeEmail) },
      },
      select: { inviteeEmail: true, inviteeName: true },
      distinct: ['inviteeEmail'],
    })
    const nameMap = new Map(guestNames.map((g) => [g.inviteeEmail, g.inviteeName]))

    topRepeatGuests = topGuestEmails.map((g) => ({
      name: nameMap.get(g.inviteeEmail) || g.inviteeEmail,
      email: g.inviteeEmail,
      bookings: g._count.inviteeEmail,
    }))
  }

  // ── Status distribution (all-time, DB-aggregated) ────────────────────────

  const statusDistribution = [
    { status: 'Completed', count: completedCount, color: '#22c55e' },
    { status: 'Confirmed', count: futureConfirmedCount, color: '#0ea5e9' },
    { status: 'Pending', count: futurePendingCount, color: '#f59e0b' },
    { status: 'Cancelled', count: cancelledCount, color: '#ef4444' },
    { status: 'Declined', count: rejectedCount, color: '#6b7280' },
  ].filter((s) => s.count > 0)

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
