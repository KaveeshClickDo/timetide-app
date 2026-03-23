/**
 * /api/teams/[id]/event-types
 * GET: List team event types
 * POST: Create a team event type
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import { z } from 'zod'
import {
  slugSchema,
  locationTypeSchema,
  schedulingTypeSchema,
  periodTypeSchema,
  eventTypeQuestionSchema,
} from '@/server/validation/schemas'
import {
  listTeamEventTypes,
  createTeamEventType,
  TeamEventTypeNotAuthorizedError,
  TeamEventTypeFeatureDeniedError,
  TeamEventTypeSubscriptionLockedError,
  TeamEventTypeSlugTakenError,
} from '@/server/services/team'

interface RouteParams {
  params: { id: string }
}

const createTeamEventTypeSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  slug: slugSchema,
  description: z.string().max(5000).optional(),
  length: z.number().int().min(5).max(720),
  bufferTimeBefore: z.number().int().min(0).max(120).default(0),
  bufferTimeAfter: z.number().int().min(0).max(120).default(0),
  minimumNotice: z.number().int().min(0).max(43200).default(60),
  slotInterval: z.number().int().min(5).max(720).optional(),
  periodType: periodTypeSchema.default('ROLLING'),
  periodDays: z.number().int().min(1).max(365).optional(),
  periodStartDate: z.string().datetime().optional(),
  periodEndDate: z.string().datetime().optional(),
  locationType: locationTypeSchema.default('GOOGLE_MEET'),
  locationValue: z.string().max(500).optional(),
  maxBookingsPerDay: z.number().int().min(1).max(100).optional(),
  seatsPerSlot: z.number().int().min(1).max(100).default(1),
  requiresConfirmation: z.boolean().default(false),
  hideNotes: z.boolean().default(false),
  successRedirectUrl: z.string().url().optional(),
  schedulingType: schedulingTypeSchema,
  questions: z.array(eventTypeQuestionSchema).optional(),
  memberIds: z.array(z.string()).optional(),
  meetingOrganizerUserId: z.string().optional(),
  allowsRecurring: z.boolean().default(false),
  recurringMaxWeeks: z.number().int().min(2).max(24).optional(),
  recurringFrequency: z.string().optional(),
  recurringInterval: z.number().int().min(1).max(90).optional(),
})

// GET /api/teams/[id]/event-types
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const eventTypes = await listTeamEventTypes(params.id, session.user.id)
    return NextResponse.json({ eventTypes })
  } catch (error) {
    if (error instanceof TeamEventTypeNotAuthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('Error listing team event types:', error)
    return NextResponse.json({ error: 'Failed to list team event types' }, { status: 500 })
  }
}

// POST /api/teams/[id]/event-types
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const body = await request.json()
    const result = createTeamEventTypeSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: result.error.flatten() },
        { status: 400 }
      )
    }

    const { questions, memberIds, meetingOrganizerUserId, ...rest } = result.data

    const eventType = await createTeamEventType({
      teamId: params.id,
      sessionUserId: session.user.id,
      data: rest,
      questions,
      memberIds,
      meetingOrganizerUserId,
    })

    return NextResponse.json({ eventType }, { status: 201 })
  } catch (error) {
    if (error instanceof TeamEventTypeNotAuthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof TeamEventTypeSubscriptionLockedError || error instanceof TeamEventTypeFeatureDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof TeamEventTypeSlugTakenError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Error creating team event type:', error)
    return NextResponse.json({ error: 'Failed to create team event type' }, { status: 500 })
  }
}
