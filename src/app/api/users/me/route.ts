import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/users/me - Get current user
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, username, timezone, timezoneAutoDetect, bio, onboardingCompleted, plan } = body

    // Validate username if provided
    if (username !== undefined) {
      // Check format
      if (!/^[a-z0-9-]+$/.test(username)) {
        return NextResponse.json(
          { error: 'Username can only contain lowercase letters, numbers, and hyphens' },
          { status: 400 }
        )
      }

      if (username.length < 3 || username.length > 30) {
        return NextResponse.json(
          { error: 'Username must be between 3 and 30 characters' },
          { status: 400 }
        )
      }

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
        ...(onboardingCompleted !== undefined && { onboardingCompleted }),
        ...(plan !== undefined && { plan }),
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
