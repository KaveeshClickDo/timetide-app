import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import { createEventTypeSchema } from '@/server/validation/schemas'
import {
  listEventTypes,
  createEventType,
  EventTypeSubscriptionLockedError,
  EventTypeLimitReachedError,
  EventTypeFeatureDeniedError,
} from '@/server/services/event-type'

// GET /api/event-types
export async function GET() {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const eventTypes = await listEventTypes(session.user.id)
    return NextResponse.json({ eventTypes })
  } catch (error) {
    console.error('Error fetching event types:', error)
    return NextResponse.json({ error: 'Failed to fetch event types' }, { status: 500 })
  }
}

// POST /api/event-types
export async function POST(request: Request) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const body = await request.json()
    const result = createEventTypeSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 })
    }

    const eventType = await createEventType({
      userId: session.user.id,
      data: result.data as any,
    })

    return NextResponse.json({ eventType }, { status: 201 })
  } catch (error) {
    if (error instanceof EventTypeSubscriptionLockedError) {
      return NextResponse.json({ error: error.message, code: 'SUBSCRIPTION_LOCKED' }, { status: 403 })
    }
    if (error instanceof EventTypeLimitReachedError) {
      return NextResponse.json({ error: error.message, code: 'PLAN_LIMIT', limit: error.limit }, { status: 403 })
    }
    if (error instanceof EventTypeFeatureDeniedError) {
      return NextResponse.json({ error: error.message, code: 'PLAN_LIMIT' }, { status: 403 })
    }
    console.error('Error creating event type:', error)
    return NextResponse.json({ error: 'Failed to create event type' }, { status: 500 })
  }
}
