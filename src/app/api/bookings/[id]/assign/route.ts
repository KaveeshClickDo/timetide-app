/**
 * /api/bookings/[id]/assign
 * POST: Assign a team member to a booking (for MANAGED scheduling type)
 * GET: Get available team members for assignment
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import { z } from 'zod'
import {
  assignTeamMember,
  getAvailableMembers,
  AssignBookingNotFoundError,
  AssignUnauthorizedError,
  AssignNotManagedError,
  AssignMemberNotFoundError,
} from '@/server/services/booking'

const assignMemberSchema = z.object({
  assignedUserId: z.string().min(1, 'Member ID is required'),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/bookings/[id]/assign
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const { error, session } = await requireAuth()
    if (error) return error

    const body = await request.json()
    const validated = assignMemberSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validated.error.flatten() },
        { status: 400 }
      )
    }

    const result = await assignTeamMember({
      bookingId: id,
      assignedUserId: validated.data.assignedUserId,
      sessionUserId: session.user.id,
    })

    return NextResponse.json({
      success: true,
      message: 'Team member assigned successfully',
      ...result,
    })
  } catch (error) {
    if (error instanceof AssignBookingNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof AssignUnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof AssignNotManagedError || error instanceof AssignMemberNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('POST assign member error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/bookings/[id]/assign
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const { error, session } = await requireAuth()
    if (error) return error

    const result = await getAvailableMembers({
      bookingId: id,
      sessionUserId: session.user.id,
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AssignBookingNotFoundError) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }
    if (error instanceof AssignUnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
    console.error('GET available members error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
