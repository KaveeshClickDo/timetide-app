import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { ticketReplySchema } from '@/lib/validation/schemas'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await req.json()
    const validated = ticketReplySchema.parse(body)

    // Verify ticket belongs to user
    const ticket = await prisma.supportTicket.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, status: true },
    })

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    if (ticket.status === 'CLOSED') {
      return NextResponse.json({ error: 'Cannot reply to a closed ticket' }, { status: 400 })
    }

    const message = await prisma.supportTicketMessage.create({
      data: {
        ticketId: id,
        senderId: session.user.id,
        message: validated.message,
        isAdminReply: false,
      },
      select: {
        id: true, message: true, isAdminReply: true, createdAt: true,
        sender: { select: { id: true, name: true, email: true } },
      },
    })

    // Reopen ticket if it was resolved
    if (ticket.status === 'RESOLVED') {
      await prisma.supportTicket.update({
        where: { id },
        data: { status: 'OPEN' },
      })
    }

    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    console.error('Ticket reply error:', error)
    return NextResponse.json({ error: 'Failed to send reply' }, { status: 500 })
  }
}
