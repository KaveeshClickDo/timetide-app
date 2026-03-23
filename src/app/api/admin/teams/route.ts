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
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [teams, total] = await Promise.all([
      prisma.team.findMany({
        where,
        select: {
          id: true, name: true, slug: true, createdAt: true,
          _count: { select: { members: true, eventTypes: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.team.count({ where }),
    ])

    return NextResponse.json({ teams, total, page, pageSize })
  } catch (error) {
    console.error('Admin teams error:', error)
    return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 })
  }
}
