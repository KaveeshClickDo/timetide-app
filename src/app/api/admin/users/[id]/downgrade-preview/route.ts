import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/auth/admin-auth'
import type { PlanTier } from '@/lib/pricing'
import {
  getDowngradePreview,
  AdminUserNotFoundError,
  AdminInvalidPlanError,
} from '@/server/services/admin'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const { id } = await params
    const targetPlan = (req.nextUrl.searchParams.get('targetPlan') || 'FREE') as PlanTier

    const preview = await getDowngradePreview(id, targetPlan)
    return NextResponse.json(preview)
  } catch (error) {
    if (error instanceof AdminUserNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof AdminInvalidPlanError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Downgrade preview error:', error)
    return NextResponse.json({ error: 'Failed to generate preview' }, { status: 500 })
  }
}
