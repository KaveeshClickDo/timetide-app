import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/admin-audit'
import { adminUpdateUserSchema } from '@/lib/validation/schemas'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const { id } = await params
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, name: true, username: true, image: true,
        plan: true, role: true, isDisabled: true, createdAt: true,
        timezone: true, onboardingCompleted: true, emailVerified: true,
        _count: { select: { bookingsAsHost: true, eventTypes: true, teamMemberships: true } },
        eventTypes: {
          select: {
            id: true, title: true, slug: true, isActive: true,
            _count: { select: { bookings: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        bookingsAsHost: {
          select: {
            id: true, startTime: true, endTime: true, status: true,
            inviteeName: true, inviteeEmail: true,
            eventType: { select: { title: true } },
          },
          orderBy: { startTime: 'desc' },
          take: 20,
        },
        teamMemberships: {
          select: {
            role: true,
            team: { select: { id: true, name: true, slug: true } },
          },
        },
        calendars: {
          select: { id: true, provider: true, name: true, syncStatus: true },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json(user)
  } catch (error) {
    console.error('Admin user detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAdmin()
  if (error) return error

  try {
    const { id } = await params
    const body = await req.json()
    const validated = adminUpdateUserSchema.parse(body)

    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { plan: true, role: true, isDisabled: true },
    })

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const user = await prisma.user.update({
      where: { id },
      data: validated,
      select: {
        id: true, email: true, name: true, plan: true, role: true, isDisabled: true,
      },
    })

    // Log admin action
    const changes: Record<string, unknown> = {}
    if (validated.plan && validated.plan !== existingUser.plan) {
      changes.plan = { from: existingUser.plan, to: validated.plan }
    }
    if (validated.role && validated.role !== existingUser.role) {
      changes.role = { from: existingUser.role, to: validated.role }
    }
    if (validated.isDisabled !== undefined && validated.isDisabled !== existingUser.isDisabled) {
      changes.isDisabled = { from: existingUser.isDisabled, to: validated.isDisabled }
    }

    if (Object.keys(changes).length > 0) {
      await logAdminAction({
        adminId: session!.user.id,
        action: 'UPDATE_USER',
        targetType: 'User',
        targetId: id,
        details: { changes, userEmail: user.email },
      })
    }

    return NextResponse.json(user)
  } catch (error) {
    console.error('Admin user update error:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAdmin()
  if (error) return error

  try {
    const { id } = await params

    const user = await prisma.user.findUnique({
      where: { id },
      select: { email: true, role: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (user.role === 'ADMIN') {
      return NextResponse.json({ error: 'Cannot delete an admin user' }, { status: 403 })
    }

    await prisma.user.delete({ where: { id } })

    await logAdminAction({
      adminId: session!.user.id,
      action: 'DELETE_USER',
      targetType: 'User',
      targetId: id,
      details: { userEmail: user.email },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin user delete error:', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
