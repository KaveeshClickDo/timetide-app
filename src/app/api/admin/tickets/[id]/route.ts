import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/server/db/prisma'
import { requireAdmin } from '@/server/auth/admin-auth'
import { logAdminAction } from '@/server/admin/admin-audit'
import { updateTicketSchema } from '@/server/validation/schemas'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const { id } = await params
    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      select: {
        id: true, subject: true, message: true, status: true,
        priority: true, category: true, adminNotes: true,
        createdAt: true, updatedAt: true,
        user: { select: { id: true, name: true, email: true } },
        assignedAdmin: { select: { id: true, name: true } },
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
    console.error('Admin ticket detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch ticket' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAdmin()
  if (error) return error

  try {
    const { id } = await params
    const body = await req.json()
    const parsed = updateTicketSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const validated = parsed.data

    const ticket = await prisma.supportTicket.update({
      where: { id },
      data: validated,
      select: { id: true, status: true, priority: true },
    })

    await logAdminAction({
      adminId: session!.user.id,
      action: 'UPDATE_TICKET',
      targetType: 'SupportTicket',
      targetId: id,
      details: { changes: validated },
    })

    return NextResponse.json(ticket)
  } catch (error) {
    console.error('Admin ticket update error:', error)
    return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 })
  }
}
