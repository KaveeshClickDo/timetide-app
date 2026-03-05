import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const ticket = await prisma.supportTicket.findFirst({
      where: { id, userId: session.user.id },
      select: {
        id: true, subject: true, message: true, status: true,
        priority: true, category: true, createdAt: true, updatedAt: true,
        messages: {
          select: {
            id: true, message: true, isAdminReply: true, createdAt: true,
            sender: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    return NextResponse.json(ticket)
  } catch (error) {
    console.error('Ticket detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch ticket' }, { status: 500 })
  }
}
