import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import {
  reactivateSubscription,
  SubscriptionUserNotFoundError,
  SubscriptionNotCancelledError,
  SubscriptionNoSubscriptionError,
  SubscriptionExpiredError,
  SubscriptionAlreadyChangedError,
} from '@/server/services/billing'

export async function POST() {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const result = await reactivateSubscription(session.user.id)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof SubscriptionUserNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof SubscriptionNotCancelledError || error instanceof SubscriptionNoSubscriptionError || error instanceof SubscriptionExpiredError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof SubscriptionAlreadyChangedError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('Reactivate error:', error)
    return NextResponse.json({ error: 'Failed to reactivate subscription' }, { status: 500 })
  }
}
