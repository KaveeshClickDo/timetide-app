import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkEventTypeFeatures } from '@/lib/plan-enforcement'
import type { PlanTier } from '@/lib/pricing'

interface RouteParams {
  params: { id: string }
}

// GET /api/event-types/[id] - Get single event type
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const eventType = await prisma.eventType.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
        schedule: {
          include: {
            slots: true,
            overrides: true,
          },
        },
        _count: {
          select: { bookings: true },
        },
      },
    })

    if (!eventType) {
      return NextResponse.json({ error: 'Event type not found' }, { status: 404 })
    }

    return NextResponse.json({ eventType })
  } catch (error) {
    console.error('Error fetching event type:', error)
    return NextResponse.json(
      { error: 'Failed to fetch event type' },
      { status: 500 }
    )
  }
}

// PATCH /api/event-types/[id] - Update event type
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Verify ownership
    const existing = await prisma.eventType.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Event type not found' }, { status: 404 })
    }

    // Enforce pro feature gates
    const plan = (session.user as any).plan as PlanTier
    const featureDenied = checkEventTypeFeatures(plan, body as Record<string, unknown>)
    if (featureDenied) return featureDenied

    // Handle slug update
    let newSlug = existing.slug
    if (body.title && body.title !== existing.title) {
      const baseSlug = body.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      newSlug = baseSlug
      let counter = 1

      while (
        await prisma.eventType.findFirst({
          where: {
            userId: session.user.id,
            slug: newSlug,
            NOT: { id: params.id },
          },
        })
      ) {
        newSlug = `${baseSlug}-${counter}`
        counter++
      }
    }

    const { questions, ...updateData } = body

    const eventType = await prisma.eventType.update({
      where: { id: params.id },
      data: {
        ...updateData,
        slug: newSlug,
      },
    })

    // Handle questions update if provided
    if (questions !== undefined) {
      // Delete existing questions
      await prisma.eventTypeQuestion.deleteMany({
        where: { eventTypeId: params.id },
      })

      // Create new questions
      if (questions.length > 0) {
        await prisma.eventTypeQuestion.createMany({
          data: questions.map((q: any, index: number) => ({
            eventTypeId: params.id,
            type: q.type,
            label: q.label,
            required: q.required ?? false,
            placeholder: q.placeholder,
            options: q.options,
            order: index,
          })),
        })
      }
    }

    return NextResponse.json({ eventType })
  } catch (error) {
    console.error('Error updating event type:', error)
    return NextResponse.json(
      { error: 'Failed to update event type' },
      { status: 500 }
    )
  }
}

// DELETE /api/event-types/[id] - Delete event type
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership
    const existing = await prisma.eventType.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Event type not found' }, { status: 404 })
    }

    // Delete associated records first
    await prisma.eventTypeQuestion.deleteMany({
      where: { eventTypeId: params.id },
    })

    await prisma.eventTypeAssignment.deleteMany({
      where: { eventTypeId: params.id },
    })

    // Delete the event type - bookings will cascade delete automatically
    await prisma.eventType.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting event type:', error)
    return NextResponse.json(
      { error: 'Failed to delete event type' },
      { status: 500 }
    )
  }
}
