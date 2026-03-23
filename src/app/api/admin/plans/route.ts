import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/server/db/prisma'
import { requireAdmin } from '@/server/auth/admin-auth'
import { logAdminAction } from '@/server/admin/admin-audit'
import { invalidateServerPlanCache } from '@/server/billing/pricing-server'

/** GET - List all plans */
export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: 'asc' },
  })

  return NextResponse.json(plans)
}

/** POST - Create a new plan */
export async function POST(req: NextRequest) {
  const { error, session } = await requireAdmin()
  if (error) return error

  try {
    const body = await req.json()

    const plan = await prisma.plan.create({
      data: {
        tier: body.tier,
        name: body.name,
        price: body.price ?? 0,
        currency: body.currency ?? 'usd',
        intervalDays: body.intervalDays ?? 30,
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? 0,
        description: body.description ?? null,
        highlightText: body.highlightText ?? null,
        priceLabel: body.priceLabel ?? null,
        priceSuffix: body.priceSuffix ?? null,
        maxEventTypes: body.maxEventTypes ?? 1,
        maxWebhooks: body.maxWebhooks ?? 0,
        customQuestions: body.customQuestions ?? false,
        groupBooking: body.groupBooking ?? false,
        recurringBooking: body.recurringBooking ?? false,
        teams: body.teams ?? false,
        analytics: body.analytics ?? false,
        features: body.features ?? [],
      },
    })

    invalidateServerPlanCache()

    await logAdminAction({
      adminId: session!.user.id,
      action: 'CREATE_PLAN',
      targetType: 'Plan',
      targetId: plan.id,
      details: { tier: plan.tier, name: plan.name, price: plan.price },
    })

    return NextResponse.json(plan, { status: 201 })
  } catch (err) {
    console.error('Create plan error:', err)
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 })
  }
}
