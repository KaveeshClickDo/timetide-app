/**
 * /api/bookings/[id]
 * GET: Get booking details
 * PATCH: Confirm, reject, skip, or unskip a booking
 * DELETE: Cancel booking
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/auth'
import { cancelBookingSchema, confirmRejectBookingSchema } from '@/server/validation/schemas'
import {
  getBookingDetails,
  BookingNotFoundError,
  BookingUnauthorizedError,
  skipOrUnskipBooking,
  confirmOrRejectBooking,
  BookingNotPendingError,
  SkipNotRecurringError,
  BookingAccessDeniedError,
  cancelBooking,
  CancelBookingNotFoundError,
  CancelBookingUnauthorizedError,
} from '@/server/services/booking'

interface RouteParams {
  params: { id: string }
}

/**
 * GET /api/bookings/[id]
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params
    const session = await getServerSession(authOptions)

    const booking = await getBookingDetails({
      id,
      sessionUserId: session?.user?.id,
    })

    return NextResponse.json({ booking })
  } catch (error) {
    if (error instanceof BookingNotFoundError) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }
    if (error instanceof BookingUnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
    console.error('GET booking error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/bookings/[id]
 * Confirm, reject, skip, or unskip a booking
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = confirmRejectBookingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { action, reason, scope } = parsed.data

    // Skip / Unskip flow
    if (action === 'skip' || action === 'unskip') {
      const result = await skipOrUnskipBooking({
        id,
        action,
        sessionUserId: session.user.id,
      })
      return NextResponse.json({ success: true, ...result })
    }

    // Confirm / Reject flow
    const result = await confirmOrRejectBooking({
      id,
      action,
      reason,
      scope,
      sessionUserId: session.user.id,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof BookingNotPendingError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof SkipNotRecurringError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof BookingAccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('PATCH booking error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/bookings/[id]
 * Cancel a booking
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params
    const session = await getServerSession(authOptions)

    let reason: string | undefined
    let cancelAllFuture = false
    let bodyData: Record<string, unknown> = {}
    try {
      bodyData = await request.json()
      const validated = cancelBookingSchema.safeParse(bodyData)
      if (validated.success) {
        reason = validated.data.reason
        cancelAllFuture = validated.data.cancelAllFuture ?? false
      }
    } catch {
      // No body or invalid JSON
    }

    const result = await cancelBooking({
      id,
      reason,
      cancelAllFuture,
      sessionUserId: session?.user?.id,
      emailVerification: bodyData?.emailVerification as {
        code: string
        signature: string
        expiresAt: number
      } | undefined,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof CancelBookingNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof CancelBookingUnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('DELETE booking error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
