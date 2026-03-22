import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/admin-auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  username: z.string().min(3).max(30).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, and hyphens only').optional(),
  timezone: z.string().min(1).max(100).optional(),
  timezoneAutoDetect: z.boolean().optional(),
  bio: z.string().max(500).optional().nullable(),
  image: z.string().url().optional().nullable(),
  onboardingCompleted: z.boolean().optional(),
})

// GET /api/users/me - Get current user
export async function GET() {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        image: true,
        timezone: true,
        timezoneAutoDetect: true,
        bio: true,
        onboardingCompleted: true,
        plan: true,
        createdAt: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    )
  }
}

// PATCH /api/users/me - Update current user
export async function PATCH(request: Request) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const body = await request.json()
    const parsed = updateProfileSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const { name, username, timezone, timezoneAutoDetect, bio, image, onboardingCompleted } = parsed.data

    // Check username availability if provided
    if (username !== undefined) {
      // Check availability
      const existing = await prisma.user.findUnique({
        where: { username },
      })

      if (existing && existing.id !== session.user.id) {
        return NextResponse.json(
          { error: 'Username is already taken' },
          { status: 400 }
        )
      }
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        ...(name !== undefined && { name }),
        ...(username !== undefined && { username }),
        ...(timezone !== undefined && { timezone }),
        ...(timezoneAutoDetect !== undefined && { timezoneAutoDetect }),
        ...(bio !== undefined && { bio }),
        ...(image !== undefined && { image }),
        ...(onboardingCompleted !== undefined && { onboardingCompleted }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        image: true,
        timezone: true,
        timezoneAutoDetect: true,
        bio: true,
        onboardingCompleted: true,
        plan: true,
      },
    })

    // When timezone changes, sync it to all availability schedules
    if (timezone !== undefined) {
      await prisma.availabilitySchedule.updateMany({
        where: { userId: session.user.id },
        data: { timezone },
      })
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    )
  }
}
