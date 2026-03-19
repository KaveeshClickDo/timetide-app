import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const { searchParams } = req.nextUrl
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '30')
    const eventType = searchParams.get('eventType') || ''
    const status = searchParams.get('status') || ''

    const where: Record<string, unknown> = {}
    if (eventType) where.eventType = eventType
    if (status) where.processingStatus = status

    const [logs, total] = await Promise.all([
      prisma.stripeWebhookLog.findMany({
        where,
        select: {
          id: true,
          eventId: true,
          eventType: true,
          apiVersion: true,
          livemode: true,
          processingStatus: true,
          errorMessage: true,
          processingTimeMs: true,
          userId: true,
          stripeCustomerId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.stripeWebhookLog.count({ where }),
    ])

    return NextResponse.json({ logs, total, page, pageSize })
  } catch (error) {
    console.error('Admin webhook logs error:', error)
    return NextResponse.json({ error: 'Failed to fetch webhook logs' }, { status: 500 })
  }
}
