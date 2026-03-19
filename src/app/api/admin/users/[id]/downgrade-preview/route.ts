import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { PLAN_LIMITS, type PlanTier } from '@/lib/pricing'

/**
 * GET /api/admin/users/[id]/downgrade-preview?targetPlan=FREE
 * Returns a read-only preview of what resources would be locked on downgrade.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const { id } = await params
    const targetPlan = (req.nextUrl.searchParams.get('targetPlan') || 'FREE') as PlanTier

    if (!['FREE', 'PRO', 'TEAM'].includes(targetPlan)) {
      return NextResponse.json({ error: 'Invalid targetPlan' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { plan: true, subscriptionStatus: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const targetLimits = PLAN_LIMITS[targetPlan]

    // --- Personal event types ---
    const personalEvents = await prisma.eventType.findMany({
      where: { userId: id, teamId: null },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
      select: { id: true, title: true, slug: true, isActive: true, lockedByDowngrade: true },
    })

    let personalToLock: typeof personalEvents = []
    if (targetLimits.maxEventTypes !== Infinity) {
      let activeKept = 0
      for (const et of personalEvents) {
        if (et.isActive && activeKept < targetLimits.maxEventTypes) {
          activeKept++
        } else if (et.isActive) {
          personalToLock.push(et)
        }
      }
    }

    // --- Webhooks ---
    const webhooks = await prisma.webhook.findMany({
      where: { userId: id, isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, url: true },
    })

    let webhooksToLock: typeof webhooks = []
    if (targetLimits.maxWebhooks === 0) {
      webhooksToLock = webhooks
    } else if (targetLimits.maxWebhooks !== Infinity) {
      webhooksToLock = webhooks.slice(targetLimits.maxWebhooks)
    }

    // --- Team event types ---
    let teamEvents: { id: string; title: string; teamName: string | null }[] = []
    let teamEventsToLock: typeof teamEvents = []
    if (!targetLimits.teams) {
      const ownedTeams = await prisma.teamMember.findMany({
        where: { userId: id, role: 'OWNER' },
        select: { teamId: true, team: { select: { name: true } } },
      })
      const ownedTeamIds = ownedTeams.map((t) => t.teamId)

      if (ownedTeamIds.length > 0) {
        const rawTeamEvents = await prisma.eventType.findMany({
          where: { teamId: { in: ownedTeamIds }, isActive: true },
          select: { id: true, title: true, team: { select: { name: true } } },
        })
        teamEventsToLock = rawTeamEvents.map((et) => ({
          id: et.id,
          title: et.title,
          teamName: et.team?.name || null,
        }))
      }
    }

    // --- Features lost ---
    const currentLimits = PLAN_LIMITS[user.plan as PlanTier]
    const booleanFeatures = ['customQuestions', 'groupBooking', 'recurringBooking', 'teams', 'analytics'] as const
    const featuresLost = booleanFeatures.filter(
      (f) => currentLimits[f] === true && targetLimits[f] === false,
    )

    return NextResponse.json({
      targetPlan,
      currentPlan: user.plan,
      personalEventTypes: {
        active: personalEvents.filter((e) => e.isActive).length,
        toLock: personalToLock.length,
        toKeep: Math.min(
          personalEvents.filter((e) => e.isActive).length,
          targetLimits.maxEventTypes === Infinity ? Infinity : targetLimits.maxEventTypes,
        ),
        items: personalToLock.map((e) => ({ id: e.id, title: e.title, slug: e.slug })),
      },
      webhooks: {
        active: webhooks.length,
        toLock: webhooksToLock.length,
        toKeep: webhooks.length - webhooksToLock.length,
        items: webhooksToLock.map((w) => ({ id: w.id, name: w.name, url: w.url })),
      },
      teamEventTypes: {
        active: teamEventsToLock.length,
        toLock: teamEventsToLock.length,
        items: teamEventsToLock,
      },
      featuresLost,
    })
  } catch (err) {
    console.error('Downgrade preview error:', err)
    return NextResponse.json({ error: 'Failed to generate preview' }, { status: 500 })
  }
}
