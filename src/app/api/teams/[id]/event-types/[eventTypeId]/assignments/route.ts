/**
 * /api/teams/[id]/event-types/[eventTypeId]/assignments
 * GET: List assigned members
 * POST: Assign member to event type
 * DELETE: Remove member assignment
 */

import { NextResponse, NextRequest } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import { z } from 'zod'
import {
  listEventTypeAssignments,
  assignMemberToEventType,
  removeEventTypeAssignment,
  TeamEventTypeNotFoundError,
  TeamEventTypeNotAuthorizedError,
  TeamEventTypeFeatureDeniedError,
  TeamEventTypeSubscriptionLockedError,
  TeamEventTypeAssignmentExistsError,
  TeamEventTypeAssignmentNotFoundError,
  TeamEventTypeMemberNotFoundError,
} from '@/server/services/team'

interface RouteParams {
  params: { id: string; eventTypeId: string }
}

const assignMemberSchema = z.object({
  memberId: z.string().min(1, 'Member ID is required'),
})

const removeMemberSchema = z.object({
  memberId: z.string().min(1, 'Member ID is required'),
})

// GET /api/teams/[id]/event-types/[eventTypeId]/assignments
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const assignments = await listEventTypeAssignments(
      params.id,
      params.eventTypeId,
      session.user.id
    )
    return NextResponse.json({ assignments })
  } catch (error) {
    if (error instanceof TeamEventTypeNotAuthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof TeamEventTypeNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('Error listing event type assignments:', error)
    return NextResponse.json({ error: 'Failed to list assignments' }, { status: 500 })
  }
}

// POST /api/teams/[id]/event-types/[eventTypeId]/assignments
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const body = await request.json()
    const result = assignMemberSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 })
    }

    const assignment = await assignMemberToEventType({
      teamId: params.id,
      eventTypeId: params.eventTypeId,
      sessionUserId: session.user.id,
      memberId: result.data.memberId,
    })

    return NextResponse.json({ assignment }, { status: 201 })
  } catch (error) {
    if (error instanceof TeamEventTypeNotAuthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof TeamEventTypeSubscriptionLockedError || error instanceof TeamEventTypeFeatureDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof TeamEventTypeNotFoundError || error instanceof TeamEventTypeMemberNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof TeamEventTypeAssignmentExistsError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Error assigning member:', error)
    return NextResponse.json({ error: 'Failed to assign member' }, { status: 500 })
  }
}

// DELETE /api/teams/[id]/event-types/[eventTypeId]/assignments
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    // Get memberId from query params or body
    const searchParams = request.nextUrl.searchParams
    let memberId = searchParams.get('memberId')

    if (!memberId) {
      try {
        const body = await request.json()
        const result = removeMemberSchema.safeParse(body)
        if (result.success) {
          memberId = result.data.memberId
        }
      } catch {
        // No body
      }
    }

    if (!memberId) {
      return NextResponse.json({ error: 'Member ID is required' }, { status: 400 })
    }

    await removeEventTypeAssignment(
      params.id,
      params.eventTypeId,
      session.user.id,
      memberId
    )

    return NextResponse.json({ success: true, message: 'Assignment removed' })
  } catch (error) {
    if (error instanceof TeamEventTypeNotAuthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof TeamEventTypeNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof TeamEventTypeAssignmentNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('Error removing assignment:', error)
    return NextResponse.json({ error: 'Failed to remove assignment' }, { status: 500 })
  }
}
