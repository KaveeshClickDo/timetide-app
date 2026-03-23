import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import prisma from '@/server/db/prisma'
import { createTicketSchema } from '@/server/validation/schemas'

export async function GET() {
  const { error, session } = await requireAuth()
  if (error) return error

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
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const body = await req.json()
    const parsed = createTicketSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const validated = parsed.data

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
