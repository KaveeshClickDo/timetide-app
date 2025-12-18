import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface RouteParams {
  params: { id: string }
}

// GET /api/availability/[id] - Get single schedule
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const schedule = await prisma.availabilitySchedule.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
      include: {
        slots: {
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        },
        overrides: {
          orderBy: { date: 'asc' },
        },
      },
    })

    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    }

    return NextResponse.json({ schedule })
  } catch (error) {
    console.error('Error fetching schedule:', error)
    return NextResponse.json(
      { error: 'Failed to fetch schedule' },
      { status: 500 }
    )
  }
}

// PUT /api/availability/[id] - Update schedule slots
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { slots, name, isDefault } = body

    // Verify ownership
    const existing = await prisma.availabilitySchedule.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    }

    // If setting as default, unset others
    if (isDefault && !existing.isDefault) {
      await prisma.availabilitySchedule.updateMany({
        where: { userId: session.user.id, NOT: { id: params.id } },
        data: { isDefault: false },
      })
    }

    // Update schedule with slots
    await prisma.$transaction(async (tx) => {
      // Update schedule name/default if provided
      if (name !== undefined || isDefault !== undefined) {
        await tx.availabilitySchedule.update({
          where: { id: params.id },
          data: {
            ...(name !== undefined && { name }),
            ...(isDefault !== undefined && { isDefault }),
          },
        })
      }

      // Replace slots if provided
      if (slots !== undefined) {
        // Delete existing slots
        await tx.availabilitySlot.deleteMany({
          where: { scheduleId: params.id },
        })

        // Create new slots
        if (slots.length > 0) {
          await tx.availabilitySlot.createMany({
            data: slots.map((slot: any) => ({
              scheduleId: params.id,
              dayOfWeek: slot.dayOfWeek,
              startTime: slot.startTime,
              endTime: slot.endTime,
            })),
          })
        }
      }
    })

    // Fetch updated schedule
    const schedule = await prisma.availabilitySchedule.findUnique({
      where: { id: params.id },
      include: {
        slots: {
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        },
      },
    })

    return NextResponse.json({ schedule })
  } catch (error) {
    console.error('Error updating schedule:', error)
    return NextResponse.json(
      { error: 'Failed to update schedule' },
      { status: 500 }
    )
  }
}

// DELETE /api/availability/[id] - Delete schedule
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership and not default
    const existing = await prisma.availabilitySchedule.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    }

    if (existing.isDefault) {
      return NextResponse.json(
        { error: 'Cannot delete default schedule' },
        { status: 400 }
      )
    }

    // Delete slots first
    await prisma.availabilitySlot.deleteMany({
      where: { scheduleId: params.id },
    })

    await prisma.dateOverride.deleteMany({
      where: { scheduleId: params.id },
    })

    // Unlink from event types
    await prisma.eventType.updateMany({
      where: { scheduleId: params.id },
      data: { scheduleId: null },
    })

    // Delete schedule
    await prisma.availabilitySchedule.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting schedule:', error)
    return NextResponse.json(
      { error: 'Failed to delete schedule' },
      { status: 500 }
    )
  }
}
