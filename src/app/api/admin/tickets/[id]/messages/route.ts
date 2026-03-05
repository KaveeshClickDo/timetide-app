import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/admin-audit'
import { ticketReplySchema } from '@/lib/validation/schemas'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAdmin()
  if (error) return error

  try {
    const { id } = await params
    const body = await req.json()
    const validated = ticketReplySchema.parse(body)

    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true, status: true },
    })

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const message = await prisma.supportTicketMessage.create({
      data: {
        ticketId: id,
        senderId: session!.user.id,
        message: validated.message,
        isAdminReply: true,
      },
      select: {
        id: true, message: true, isAdminReply: true, createdAt: true,
        sender: { select: { id: true, name: true, email: true } },
      },
    })

    // Auto-update status to IN_PROGRESS if currently OPEN
    if (ticket.status === 'OPEN') {
      await prisma.supportTicket.update({
        where: { id },
        data: { status: 'IN_PROGRESS' },
      })
    }

    await logAdminAction({
      adminId: session!.user.id,
      action: 'REPLY_TICKET',
      targetType: 'SupportTicket',
      targetId: id,
    })

    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    console.error('Admin ticket reply error:', error)
    return NextResponse.json({ error: 'Failed to send reply' }, { status: 500 })
  }
}
