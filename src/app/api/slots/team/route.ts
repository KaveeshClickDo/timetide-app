/**
 * GET /api/slots/team
 * Public endpoint to get available time slots for a team event type
 * Supports all three scheduling types: ROUND_ROBIN, COLLECTIVE, MANAGED
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSlotsRateLimit } from '@/server/infrastructure/queue'
import {
  calculateTeamSlots,
  TeamSlotsTeamNotFoundError,
  TeamSlotsEventTypeNotFoundError,
  TeamSlotsNotTeamSchedulingError,
} from '@/server/services/slots'

const teamSlotsQuerySchema = z.object({
  teamSlug: z.string().min(1),
  eventSlug: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  timezone: z.string().default('UTC'),
})

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

    // Parse query params
    const searchParams = request.nextUrl.searchParams
    const query = {
      teamSlug: searchParams.get('teamSlug') || '',
      eventSlug: searchParams.get('eventSlug') || '',
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      timezone: searchParams.get('timezone') || 'UTC',
    }

    const validated = teamSlotsQuerySchema.safeParse(query)
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: validated.error.flatten() },
        { status: 400 }
      )
    }

    const result = await calculateTeamSlots({
      teamSlug: validated.data.teamSlug,
      eventSlug: validated.data.eventSlug,
      startDate: validated.data.startDate,
      endDate: validated.data.endDate,
      timezone: validated.data.timezone,
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof TeamSlotsTeamNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof TeamSlotsEventTypeNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof TeamSlotsNotTeamSchedulingError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Team slots API error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
