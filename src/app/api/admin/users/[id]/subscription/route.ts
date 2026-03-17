import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getSubscriptionSummary } from '@/lib/subscription-lifecycle'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const { id } = await params
    const summary = await getSubscriptionSummary(id)

    if (!summary) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json(summary)
  } catch (err) {
    console.error('Admin subscription info error:', err)
    return NextResponse.json({ error: 'Failed to fetch subscription info' }, { status: 500 })
  }
}
