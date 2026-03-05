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
