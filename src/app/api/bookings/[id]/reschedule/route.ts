/**
 * /api/bookings/[id]/reschedule
 * POST: Reschedule a booking to a new time
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/auth'
import { rescheduleBookingSchema } from '@/server/validation/schemas'
import {
  rescheduleBooking,
  RescheduleBookingNotFoundError,
  RescheduleUnauthorizedError,
  RescheduleTimeInPastError,
  RescheduleConflictError,
} from '@/server/services/booking'

interface RouteParams {
  params: { id: string }
}

/**
 * POST /api/bookings/[id]/reschedule
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params
    const session = await getServerSession(authOptions)

    const body = await request.json()
    const validated = rescheduleBookingSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validated.error.flatten() },
        { status: 400 }
      )
    }

    const result = await rescheduleBooking({
      id,
      newStartTime: validated.data.newStartTime,
      reason: validated.data.reason,
      scope: validated.data.scope,
      sessionUserId: session?.user?.id,
      emailVerification: body.emailVerification,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof RescheduleBookingNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof RescheduleUnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof RescheduleTimeInPastError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof RescheduleConflictError) {
      return NextResponse.json(
        { error: error.message, conflictDate: error.conflictDate },
        { status: 409 }
      )
    }
    console.error('POST reschedule booking error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
