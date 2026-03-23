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
    const search = searchParams.get('search') || ''
    const plan = searchParams.get('plan') || ''
    const role = searchParams.get('role') || ''
    const status = searchParams.get('status') || ''
    const subscriptionStatus = searchParams.get('subscriptionStatus') || ''
    const sortBy = searchParams.get('sortBy') || 'createdAt'
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc'

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
      ]
    }

    if (plan) where.plan = plan
    if (role) where.role = role
    if (subscriptionStatus) where.subscriptionStatus = subscriptionStatus

    if (status === 'disabled') {
      where.isDisabled = true
    } else if (status === 'unverified') {
      where.isDisabled = false
      where.emailVerified = null
    } else if (status === 'active') {
      where.isDisabled = false
      where.emailVerified = { not: null }
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, name: true, username: true, image: true,
          plan: true, role: true, isDisabled: true, emailVerified: true,
          subscriptionStatus: true, createdAt: true,
          password: true,
          accounts: { select: { provider: true } },
          _count: { select: { bookingsAsHost: true, eventTypes: true, teamMemberships: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ])

    const safeUsers = users.map(({ password, accounts, ...user }) => ({
      ...user,
      hasPassword: !!password,
      authProviders: accounts.map((a) => a.provider),
    }))

    return NextResponse.json({ users: safeUsers, total, page, pageSize })
  } catch (error) {
    console.error('Admin users list error:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}
