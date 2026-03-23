import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import prisma from '@/server/db/prisma'
import { createTicketSchema } from '@/server/validation/schemas'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/server/api-constants'

export async function GET(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const { searchParams } = req.nextUrl
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE))))
    const status = searchParams.get('status') || ''

    const where: Record<string, unknown> = { userId: session.user.id }
    if (status) where.status = status

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        select: {
          id: true, subject: true, status: true, priority: true,
          category: true, createdAt: true, updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.supportTicket.count({ where }),
    ])

    return NextResponse.json({ tickets, total, page, pageSize })
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
