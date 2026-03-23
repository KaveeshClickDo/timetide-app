import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import {
  getEventType,
  updateEventType,
  deleteEventType,
  EventTypeNotFoundError,
  EventTypeFeatureDeniedError,
  EventTypeActiveLimitError,
} from '@/server/services/event-type'

interface RouteParams {
  params: { id: string }
}

// GET /api/event-types/[id]
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const eventType = await getEventType(params.id, session.user.id)
    return NextResponse.json({ eventType })
  } catch (error) {
    if (error instanceof EventTypeNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('Error fetching event type:', error)
    return NextResponse.json({ error: 'Failed to fetch event type' }, { status: 500 })
  }
}

// PATCH /api/event-types/[id]
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const body = await request.json()
    const eventType = await updateEventType({
      eventTypeId: params.id,
      userId: session.user.id,
      data: body,
    })

    return NextResponse.json({ eventType })
  } catch (error) {
    if (error instanceof EventTypeNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof EventTypeFeatureDeniedError) {
      return NextResponse.json({ error: error.message, code: 'PLAN_LIMIT' }, { status: 403 })
    }
    if (error instanceof EventTypeActiveLimitError) {
      return NextResponse.json({ error: error.message, code: 'PLAN_LIMIT' }, { status: 403 })
    }
    console.error('Error updating event type:', error)
    return NextResponse.json({ error: 'Failed to update event type' }, { status: 500 })
  }
}

// DELETE /api/event-types/[id]
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    await deleteEventType(params.id, session.user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof EventTypeNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('Error deleting event type:', error)
    return NextResponse.json({ error: 'Failed to delete event type' }, { status: 500 })
  }
}
