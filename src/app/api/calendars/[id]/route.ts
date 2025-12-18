import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface RouteParams {
  params: { id: string }
}

// GET /api/calendars/[id] - Get single calendar
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const calendar = await prisma.calendar.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
      include: {
        credential: {
          select: {
            provider: true,
            isValid: true,
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
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { isEnabled, checkForConflicts, isPrimary } = body

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

    // If setting as primary, unset other primary calendars
    if (isPrimary) {
      await prisma.calendar.updateMany({
        where: {
          userId: session.user.id,
          isPrimary: true,
        },
        data: {
          isPrimary: false,
        },
      })
    }

    const calendar = await prisma.calendar.update({
      where: { id: params.id },
      data: {
        isEnabled: isEnabled !== undefined ? isEnabled : existing.isEnabled,
        checkForConflicts: checkForConflicts !== undefined ? checkForConflicts : existing.checkForConflicts,
        isPrimary: isPrimary !== undefined ? isPrimary : existing.isPrimary,
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
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership and get credential
    const calendar = await prisma.calendar.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
      include: {
        credential: true,
      },
    })

    if (!calendar) {
      return NextResponse.json({ error: 'Calendar not found' }, { status: 404 })
    }

    // Delete the calendar
    await prisma.calendar.delete({
      where: { id: params.id },
    })

    // Check if credential has other calendars
    const otherCalendars = await prisma.calendar.count({
      where: {
        credentialId: calendar.credentialId,
      },
    })

    // If no other calendars use this credential, delete it too
    if (otherCalendars === 0 && calendar.credentialId) {
      await prisma.calendarCredential.delete({
        where: { id: calendar.credentialId },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error disconnecting calendar:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect calendar' },
      { status: 500 }
    )
  }
}
