/**
 * GET /api/slots
 * Public endpoint to get available time slots for an event type
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSlotsQuerySchema } from '@/server/validation/schemas'
import { checkSlotsRateLimit } from '@/server/infrastructure/queue'
import {
  calculateSlots,
  SlotsEventTypeNotFoundError,
} from '@/server/services/slots'

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
    const rateLimitResult = await checkSlotsRateLimit(ip)
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
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

    // Parse and validate query params
    const searchParams = request.nextUrl.searchParams
    const query = {
      eventTypeId: searchParams.get('eventTypeId'),
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
      timezone: searchParams.get('timezone') ?? 'UTC',
    }

    const validated = getSlotsQuerySchema.safeParse(query)
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: validated.error.flatten() },
        { status: 400 }
      )
    }

    const result = await calculateSlots({
      eventTypeId: validated.data.eventTypeId,
      startDate: validated.data.startDate,
      endDate: validated.data.endDate,
      timezone: validated.data.timezone,
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof SlotsEventTypeNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('Slots API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
