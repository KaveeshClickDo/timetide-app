import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import { computeAnalytics, AnalyticsFeatureDeniedError } from '@/server/services/analytics'

export async function GET() {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const result = await computeAnalytics(session.user.id)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AnalyticsFeatureDeniedError) {
      return NextResponse.json({ error: error.message, code: 'PLAN_LIMIT' }, { status: 403 })
    }
    console.error('Analytics error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
