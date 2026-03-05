import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const { id } = await params
    const team = await prisma.team.findUnique({
      where: { id },
      select: {
        id: true, name: true, slug: true, description: true, createdAt: true,
        _count: { select: { members: true, eventTypes: true } },
        members: {
          select: {
            id: true, role: true,
            user: { select: { id: true, name: true, email: true, image: true } },
          },
        },
        eventTypes: {
          select: {
            id: true, title: true, slug: true, isActive: true, schedulingType: true,
          },
        },
      },
    })

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    return NextResponse.json(team)
  } catch (error) {
    console.error('Admin team detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch team' }, { status: 500 })
  }
}
