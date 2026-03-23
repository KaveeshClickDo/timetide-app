import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/server/db/prisma'
import { requireAdmin } from '@/server/auth/admin-auth'
import { DEFAULT_PAGE_SIZE } from '@/server/api-constants'

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const { searchParams } = req.nextUrl
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE))
    const status = searchParams.get('status') || ''
    const priority = searchParams.get('priority') || ''

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (priority) where.priority = priority

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        select: {
          id: true, subject: true, status: true, priority: true,
          category: true, createdAt: true, updatedAt: true,
          user: { select: { id: true, name: true, email: true } },
          assignedAdmin: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.supportTicket.count({ where }),
    ])

    return NextResponse.json({ tickets, total, page, pageSize })
  } catch (error) {
    console.error('Admin tickets error:', error)
    return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 })
  }
}
