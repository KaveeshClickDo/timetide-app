/**
 * /api/bookings
 * GET: List user's bookings (authenticated)
 * POST: Create a new booking (public)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import { createBookingSchema } from '@/server/validation/schemas'
import { checkBookingRateLimit } from '@/server/infrastructure/queue'
import {
  listBookings,
  createBooking,
  TeamSelectionError,
  SlotUnavailableError,
  MinimumNoticeError,
  RecurringSlotError,
  EmailVerificationRequiredError,
  EmailVerificationFailedError,
  EventTypeNotFoundError,
  RecurringNotAllowedError,
  RecurringWindowError,
  SeatsFullError,
  MemberConflictError,
  SerializationConflictError,
} from '@/server/services/booking'

/**
 * GET /api/bookings
 */
export async function GET(request: NextRequest) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const searchParams = request.nextUrl.searchParams
    const bookings = await listBookings({
      userId: session.user.id,
      status: searchParams.get('status'),
      upcoming: searchParams.get('upcoming') === 'true',
      past: searchParams.get('past') === 'true',
    })

    return NextResponse.json({ bookings })
  } catch (error) {
    console.error('GET bookings error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/bookings
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
    const rateLimitResult = await checkBookingRateLimit(ip)
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many booking attempts. Please try again later.' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.resetAt.toString(),
          },
        }
      )
    }

    // Parse and validate body
    const body = await request.json()
    const validated = createBookingSchema.safeParse(body)
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid booking data', details: validated.error.flatten() },
        { status: 400 }
      )
    }

    const result = await createBooking({
      ...validated.data,
      emailVerification: body.emailVerification,
    })

    return NextResponse.json(
      { success: true, ...result },
      { status: 201 }
    )
  } catch (error) {
    // Map domain errors to HTTP responses
    if (error instanceof EmailVerificationRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof EmailVerificationFailedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof EventTypeNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof RecurringNotAllowedError || error instanceof RecurringWindowError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof TeamSelectionError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    if (error instanceof MinimumNoticeError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof SlotUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    if (error instanceof RecurringSlotError) {
      return NextResponse.json(
        { error: error.message, conflictWeek: error.conflictWeek },
        { status: 409 }
      )
    }
    if (error instanceof SeatsFullError || error instanceof MemberConflictError || error instanceof SerializationConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('POST booking error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
