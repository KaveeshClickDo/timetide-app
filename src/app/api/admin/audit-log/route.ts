import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/server/db/prisma'
import { requireAdmin } from '@/server/auth/admin-auth'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/server/api-constants'

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const { searchParams } = req.nextUrl
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE))))
    const action = searchParams.get('action') || ''

    const where: Record<string, unknown> = {}
    if (action) where.action = action

    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        select: {
          id: true, action: true, targetType: true, targetId: true,
          details: true, createdAt: true,
          admin: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.adminAuditLog.count({ where }),
    ])

    return NextResponse.json({ logs, total, page, pageSize })
  } catch (error) {
    console.error('Admin audit log error:', error)
    return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 })
  }
}
