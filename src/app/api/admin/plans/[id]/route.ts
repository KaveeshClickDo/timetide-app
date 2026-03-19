import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/admin-audit'
import { invalidateServerPlanCache } from '@/lib/pricing-server'

/** GET - Get a single plan */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin()
  if (error) return error

  const { id } = await params
  const plan = await prisma.plan.findUnique({ where: { id } })
  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

  return NextResponse.json(plan)
}

/** PATCH - Update a plan */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAdmin()
  if (error) return error

  const { id } = await params

  try {
    const body = await req.json()

    // Build update data from provided fields only
    const updateData: Record<string, unknown> = {}
    const allowedFields = [
      'name', 'price', 'currency', 'intervalDays', 'isActive', 'sortOrder',
      'description', 'highlightText', 'priceLabel', 'priceSuffix',
      'maxEventTypes', 'maxWebhooks', 'customQuestions', 'groupBooking',
      'recurringBooking', 'teams', 'analytics', 'features',
    ]
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    const plan = await prisma.plan.update({
      where: { id },
      data: updateData,
    })

    invalidateServerPlanCache()

    await logAdminAction({
      adminId: session!.user.id,
      action: 'UPDATE_PLAN',
      targetType: 'Plan',
      targetId: id,
      details: { tier: plan.tier, changes: updateData },
    })

    return NextResponse.json(plan)
  } catch (err) {
    console.error('Update plan error:', err)
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 })
  }
}

/** DELETE - Soft-delete a plan (set isActive = false) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAdmin()
  if (error) return error

  const { id } = await params

  const plan = await prisma.plan.update({
    where: { id },
    data: { isActive: false },
  })

  invalidateServerPlanCache()

  await logAdminAction({
    adminId: session!.user.id,
    action: 'DELETE_PLAN',
    targetType: 'Plan',
    targetId: id,
    details: { tier: plan.tier },
  })

  return NextResponse.json({ success: true })
}
