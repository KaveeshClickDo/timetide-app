import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createEventTypeSchema } from '@/lib/validation/schemas'
import { nanoid } from 'nanoid'

// GET /api/event-types - List all event types for current user
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const eventTypes = await prisma.eventType.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        _count: {
          select: {
            bookings: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json({ eventTypes })
  } catch (error) {
    console.error('Error fetching event types:', error)
    return NextResponse.json(
      { error: 'Failed to fetch event types' },
      { status: 500 }
    )
  }
}

// POST /api/event-types - Create new event type
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const result = createEventTypeSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      )
    }

    const { title, description, duration, locationType, ...rest } = result.data

    // Generate unique slug
    const baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    let slug = baseSlug
    let counter = 1

    while (
      await prisma.eventType.findFirst({
        where: { userId: session.user.id, slug },
      })
    ) {
      slug = `${baseSlug}-${counter}`
      counter++
    }

    // Get user's default availability schedule
    const defaultSchedule = await prisma.availabilitySchedule.findFirst({
      where: {
        userId: session.user.id,
        isDefault: true,
      },
    })

    const eventType = await prisma.eventType.create({
      data: {
        userId: session.user.id,
        title,
        slug,
        description: description || null,
        duration,
        locationType,
        scheduleId: defaultSchedule?.id,
        isActive: true,
        ...rest,
      },
    })

    return NextResponse.json({ eventType }, { status: 201 })
  } catch (error) {
    console.error('Error creating event type:', error)
    return NextResponse.json(
      { error: 'Failed to create event type' },
      { status: 500 }
    )
  }
}
