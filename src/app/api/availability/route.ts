import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import prisma from '@/server/db/prisma'
import { availabilitySlotSchema } from '@/server/validation/schemas'
import { z } from 'zod'

// Route-specific schema: timezone is derived server-side from user record, not from body
const createScheduleBodySchema = z.object({
  name: z.string().min(1).max(100),
  isDefault: z.boolean().default(false),
  slots: z.array(availabilitySlotSchema).optional(),
})

// GET /api/availability - List all availability schedules
export async function GET() {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const schedules = await prisma.availabilitySchedule.findMany({
      where: { userId: session.user.id },
      include: {
        slots: {
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        },
        overrides: {
          orderBy: { date: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ schedules })
  } catch (error) {
    console.error('Error fetching availability:', error)
    return NextResponse.json(
      { error: 'Failed to fetch availability' },
      { status: 500 }
    )
  }
}

// POST /api/availability - Create new schedule
export async function POST(request: Request) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const body = await request.json()
    const parsed = createScheduleBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const { name, slots, isDefault } = parsed.data

    // Get user's timezone to set on the schedule
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { timezone: true },
    })

    // If this is set as default, unset other defaults
    if (isDefault) {
      await prisma.availabilitySchedule.updateMany({
        where: { userId: session.user.id },
        data: { isDefault: false },
      })
    }

    const schedule = await prisma.availabilitySchedule.create({
      data: {
        userId: session.user.id,
        name,
        isDefault: isDefault || false,
        timezone: user?.timezone || 'UTC',
        slots: slots
          ? {
              create: slots.map((slot) => ({
                dayOfWeek: slot.dayOfWeek,
                startTime: slot.startTime,
                endTime: slot.endTime,
              })),
            }
          : undefined,
      },
      include: {
        slots: true,
      },
    })

    return NextResponse.json({ schedule }, { status: 201 })
  } catch (error) {
    console.error('Error creating schedule:', error)
    return NextResponse.json(
      { error: 'Failed to create schedule' },
      { status: 500 }
    )
  }
}
