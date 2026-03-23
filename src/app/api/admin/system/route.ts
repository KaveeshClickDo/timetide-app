import { NextResponse } from 'next/server'
import prisma from '@/server/db/prisma'
import { requireAdmin } from '@/server/auth/admin-auth'

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const [
      webhookDeliveryStats,
      calendarSyncStats,
      recentFailedDeliveries,
    ] = await Promise.all([
      prisma.webhookDelivery.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      prisma.calendar.groupBy({
        by: ['syncStatus'],
        _count: { syncStatus: true },
      }),
      prisma.webhookDelivery.findMany({
        where: { status: 'FAILED' },
        select: {
          id: true, webhookId: true, eventType: true,
          errorMessage: true, createdAt: true,
          webhook: { select: { name: true, url: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ])

    // Calculate webhook health
    const webhookHealth = { total: 0, success: 0, failed: 0, pending: 0 }
    webhookDeliveryStats.forEach((s) => {
      const count = s._count.status
      webhookHealth.total += count
      if (s.status === 'SUCCESS') webhookHealth.success = count
      else if (s.status === 'FAILED') webhookHealth.failed = count
      else if (s.status === 'PENDING' || s.status === 'RETRYING') webhookHealth.pending += count
    })

    return NextResponse.json({
      webhookHealth,
      calendarSyncStatus: calendarSyncStats.map((c) => ({
        status: c.syncStatus,
        count: c._count.syncStatus,
      })),
      recentFailedDeliveries,
    })
  } catch (error) {
    console.error('Admin system error:', error)
    return NextResponse.json({ error: 'Failed to fetch system health' }, { status: 500 })
  }
}
