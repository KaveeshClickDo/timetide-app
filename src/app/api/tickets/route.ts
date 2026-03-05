import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { createTicketSchema } from '@/lib/validation/schemas'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const tickets = await prisma.supportTicket.findMany({
      where: { userId: session.user.id },
      select: {
        id: true, subject: true, status: true, priority: true,
        category: true, createdAt: true, updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    return NextResponse.json({ tickets })
  } catch (error) {
    console.error('Tickets list error:', error)
    return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const validated = createTicketSchema.parse(body)

    const ticket = await prisma.supportTicket.create({
      data: {
        userId: session.user.id,
        subject: validated.subject,
        message: validated.message,
        category: validated.category,
        priority: validated.priority || 'MEDIUM',
      },
      select: {
        id: true, subject: true, status: true, priority: true,
        category: true, createdAt: true, updatedAt: true,
      },
    })

    return NextResponse.json(ticket, { status: 201 })
  } catch (error) {
    console.error('Create ticket error:', error)
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 })
  }
}
