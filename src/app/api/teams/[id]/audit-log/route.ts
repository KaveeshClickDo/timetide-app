import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface RouteParams {
  params: { id: string }
}

// GET /api/teams/[id]/audit-log - Get team audit log
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin/owner
    const membership = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: params.id,
          userId: session.user.id,
        },
      },
    })

    if (!membership || membership.role === 'MEMBER') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const cursor = searchParams.get('cursor')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)

    const logs = await prisma.teamAuditLog.findMany({
      where: { teamId: params.id },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    })

    // Resolve user names for display
    const userIds = Array.from(new Set(logs.map((log) => log.userId)))
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, image: true },
    })
    const userMap = new Map(users.map((u) => [u.id, u]))

    const hasMore = logs.length > limit
    const items = hasMore ? logs.slice(0, limit) : logs

    return NextResponse.json({
      logs: items.map((log) => ({
        ...log,
        user: userMap.get(log.userId) || { id: log.userId, name: 'Unknown', email: '', image: null },
      })),
      nextCursor: hasMore ? items[items.length - 1].id : null,
    })
  } catch (error) {
    console.error('Error fetching audit log:', error)
    return NextResponse.json(
      { error: 'Failed to fetch audit log' },
      { status: 500 }
    )
  }
}
