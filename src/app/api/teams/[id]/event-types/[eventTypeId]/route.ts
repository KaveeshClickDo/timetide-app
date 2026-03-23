/**
 * /api/teams/[id]/event-types/[eventTypeId]
 * GET: Get single team event type
 * PATCH: Update a team event type
 * DELETE: Delete a team event type
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import { z } from 'zod'
import {
  locationTypeSchema,
  schedulingTypeSchema,
  periodTypeSchema,
  eventTypeQuestionSchema,
} from '@/server/validation/schemas'
import {
  getTeamEventType,
  updateTeamEventType,
  deleteTeamEventType,
  TeamEventTypeNotFoundError,
  TeamEventTypeNotAuthorizedError,
  TeamEventTypeFeatureDeniedError,
  TeamEventTypeSubscriptionLockedError,
  TeamEventTypeSlugTakenError,
} from '@/server/services/team'

interface RouteParams {
  params: { id: string; eventTypeId: string }
}

const updateTeamEventTypeSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional().nullable(),
  length: z.number().int().min(5).max(720).optional(),
  bufferTimeBefore: z.number().int().min(0).max(120).optional(),
  bufferTimeAfter: z.number().int().min(0).max(120).optional(),
  minimumNotice: z.number().int().min(0).max(43200).optional(),
  slotInterval: z.number().int().min(5).max(720).optional().nullable(),
  periodType: periodTypeSchema.optional(),
  periodDays: z.number().int().min(1).max(365).optional().nullable(),
  periodStartDate: z.string().datetime().optional().nullable(),
  periodEndDate: z.string().datetime().optional().nullable(),
  locationType: locationTypeSchema.optional(),
  locationValue: z.string().max(500).optional().nullable(),
  maxBookingsPerDay: z.number().int().min(1).max(100).optional().nullable(),
  seatsPerSlot: z.number().int().min(1).max(100).optional(),
  requiresConfirmation: z.boolean().optional(),
  hideNotes: z.boolean().optional(),
  isActive: z.boolean().optional(),
  schedulingType: schedulingTypeSchema.optional(),
  questions: z.array(eventTypeQuestionSchema).optional(),
  memberIds: z.array(z.string()).optional(),
  meetingOrganizerUserId: z.string().optional().nullable(),
  allowsRecurring: z.boolean().optional(),
  recurringMaxWeeks: z.number().int().min(2).max(24).optional(),
  recurringFrequency: z.string().optional(),
  recurringInterval: z.number().int().min(1).max(90).optional(),
})

// GET /api/teams/[id]/event-types/[eventTypeId]
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const eventType = await getTeamEventType(params.id, params.eventTypeId, session.user.id)
    return NextResponse.json({ eventType })
  } catch (error) {
    if (error instanceof TeamEventTypeNotAuthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof TeamEventTypeNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('Error fetching team event type:', error)
    return NextResponse.json({ error: 'Failed to fetch team event type' }, { status: 500 })
  }
}

// PATCH /api/teams/[id]/event-types/[eventTypeId]
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const body = await request.json()
    const result = updateTeamEventTypeSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: result.error.flatten() },
        { status: 400 }
      )
    }

    const { questions, memberIds, meetingOrganizerUserId, ...rest } = result.data

    const eventType = await updateTeamEventType({
      teamId: params.id,
      eventTypeId: params.eventTypeId,
      sessionUserId: session.user.id,
      data: rest,
      questions,
      memberIds,
      meetingOrganizerUserId,
    })

    return NextResponse.json({ eventType })
  } catch (error) {
    if (error instanceof TeamEventTypeNotAuthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof TeamEventTypeSubscriptionLockedError || error instanceof TeamEventTypeFeatureDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof TeamEventTypeNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof TeamEventTypeSlugTakenError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Error updating team event type:', error)
    return NextResponse.json({ error: 'Failed to update team event type' }, { status: 500 })
  }
}

// DELETE /api/teams/[id]/event-types/[eventTypeId]
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    await deleteTeamEventType(params.id, params.eventTypeId, session.user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof TeamEventTypeNotAuthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof TeamEventTypeNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('Error deleting team event type:', error)
    return NextResponse.json({ error: 'Failed to delete team event type' }, { status: 500 })
  }
}
