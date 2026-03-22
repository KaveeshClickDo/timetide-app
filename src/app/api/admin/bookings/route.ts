import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { DEFAULT_PAGE_SIZE } from '@/lib/api-constants'

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const { searchParams } = req.nextUrl
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE))
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { inviteeName: { contains: search, mode: 'insensitive' } },
        { inviteeEmail: { contains: search, mode: 'insensitive' } },
      ]
    }

    if (status) where.status = status
    if (dateFrom || dateTo) {
      where.startTime = {}
      if (dateFrom) (where.startTime as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.startTime as Record<string, unknown>).lte = new Date(dateTo)
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        select: {
          id: true, uid: true, startTime: true, endTime: true, status: true,
          inviteeName: true, inviteeEmail: true,
          host: { select: { id: true, name: true, email: true } },
          eventType: { select: { id: true, title: true } },
        },
        orderBy: { startTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.booking.count({ where }),
    ])

    return NextResponse.json({ bookings, total, page, pageSize })
  } catch (error) {
    console.error('Admin bookings error:', error)
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
  }
}
