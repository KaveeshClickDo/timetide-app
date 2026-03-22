import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/admin-auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'

const updateCalendarSchema = z.object({
  isEnabled: z.boolean().optional(),
})

interface RouteParams {
  params: { id: string }
}

// GET /api/calendars/[id] - Get single calendar
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const calendar = await prisma.calendar.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
      include: {
        credentials: {
          select: {
            id: true,
            expiresAt: true,
          },
        },
      },
    })

    if (!calendar) {
      return NextResponse.json({ error: 'Calendar not found' }, { status: 404 })
    }

    return NextResponse.json({ calendar })
  } catch (error) {
    console.error('Error fetching calendar:', error)
    return NextResponse.json(
      { error: 'Failed to fetch calendar' },
      { status: 500 }
    )
  }
}

// PATCH /api/calendars/[id] - Update calendar settings
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const body = await request.json()
    const parsed = updateCalendarSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const { isEnabled } = parsed.data

    // Verify ownership
    const existing = await prisma.calendar.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Calendar not found' }, { status: 404 })
    }

    const calendar = await prisma.calendar.update({
      where: { id: params.id },
      data: {
        isEnabled: isEnabled !== undefined ? isEnabled : existing.isEnabled,
      },
    })

    return NextResponse.json({ calendar })
  } catch (error) {
    console.error('Error updating calendar:', error)
    return NextResponse.json(
      { error: 'Failed to update calendar' },
      { status: 500 }
    )
  }
}

// DELETE /api/calendars/[id] - Disconnect calendar
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    // Verify ownership and get credential
    const calendar = await prisma.calendar.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
      include: {
        credentials: true,
      },
    })

    if (!calendar) {
      return NextResponse.json({ error: 'Calendar not found' }, { status: 404 })
    }

    // Delete the calendar (credentials will be cascaded)
    await prisma.calendar.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error disconnecting calendar:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect calendar' },
      { status: 500 }
    )
  }
}
