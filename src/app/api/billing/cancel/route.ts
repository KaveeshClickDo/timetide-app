import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import {
  cancelSubscription,
  SubscriptionNoActiveError,
  SubscriptionFreePlanError,
} from '@/server/services/billing'

export async function POST() {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const result = await cancelSubscription(session.user.id)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof SubscriptionNoActiveError || error instanceof SubscriptionFreePlanError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Cancel subscription error:', error)
    return NextResponse.json({ error: 'Failed to cancel subscription' }, { status: 400 })
  }
}
