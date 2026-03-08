import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfWeek = new Date(startOfToday)
    startOfWeek.setDate(startOfWeek.getDate() - 7)
    const startOfMonth = new Date(startOfToday)
    startOfMonth.setDate(startOfMonth.getDate() - 30)

    const [
      totalUsers,
      newSignupsToday,
      newSignupsWeek,
      newSignupsMonth,
      totalBookings,
      bookingsToday,
      activeTeams,
      openTickets,
      planDistribution,
      recentSignups,
      recentBookings,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.user.count({ where: { createdAt: { gte: startOfWeek } } }),
      prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.booking.count(),
      prisma.booking.count({ where: { startTime: { gte: startOfToday } } }),
      prisma.team.count(),
      prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      prisma.user.groupBy({ by: ['plan'], _count: { plan: true } }),
      prisma.user.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, name: true, username: true, image: true,
          plan: true, role: true, isDisabled: true, emailVerified: true, createdAt: true,
          password: true,
          accounts: { select: { provider: true } },
          _count: { select: { bookingsAsHost: true, eventTypes: true, teamMemberships: true } },
        },
      }),
      prisma.booking.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, uid: true, startTime: true, endTime: true, status: true,
          inviteeName: true, inviteeEmail: true,
          host: { select: { id: true, name: true, email: true } },
          eventType: { select: { id: true, title: true } },
        },
      }),
    ])

    return NextResponse.json({
      totalUsers,
      newSignupsToday,
      newSignupsWeek,
      newSignupsMonth,
      totalBookings,
      bookingsToday,
      activeTeams,
      openTickets,
      planDistribution: planDistribution.map((p) => ({ plan: p.plan, count: p._count.plan })),
      recentSignups: recentSignups.map(({ password, accounts, ...u }) => ({
        ...u,
        hasPassword: !!password,
        authProviders: accounts.map((a) => a.provider),
      })),
      recentBookings,
    })
  } catch (error) {
    console.error('Admin stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
