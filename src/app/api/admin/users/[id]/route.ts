import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/admin-audit'
import { adminUpdateUserSchema } from '@/lib/validation/schemas'
import {
  activateSubscription,
  adminDowngradeImmediate,
  adminDowngradeWithGrace,
  cancelDowngrade,
  SubscriptionError,
} from '@/lib/subscription-lifecycle'
import type { PlanTier } from '@/lib/pricing'
import { checkAdminRateLimit } from '@/lib/infrastructure/queue'

const TIER_ORDER: PlanTier[] = ['FREE', 'PRO', 'TEAM']

/** Which subscription statuses each admin plan action is allowed from */
const VALID_ADMIN_TRANSITIONS: Record<string, string[]> = {
  // Upgrade works from any status (lifecycle handles reactivation from LOCKED)
  upgrade: ['NONE', 'ACTIVE', 'UNSUBSCRIBED', 'GRACE_PERIOD', 'DOWNGRADING', 'LOCKED'],
  // Immediate downgrade: only from states that have an active/pending plan
  downgrade_immediate: ['ACTIVE', 'UNSUBSCRIBED', 'GRACE_PERIOD', 'DOWNGRADING'],
  // Grace downgrade: only from stable active states (not already transitioning)
  downgrade_grace: ['ACTIVE', 'UNSUBSCRIBED'],
  // Cancel downgrade: only from DOWNGRADING
  cancel_downgrade: ['DOWNGRADING'],
}

function validateAdminTransition(
  planAction: string,
  currentStatus: string,
  currentPlan: string,
  targetPlan?: string,
): string | null {
  // Check status is valid for this action
  const allowedStatuses = VALID_ADMIN_TRANSITIONS[planAction]
  if (allowedStatuses && !allowedStatuses.includes(currentStatus)) {
    return `Cannot ${planAction.replace('_', ' ')}: user is in ${currentStatus} status`
  }

  // For upgrade: target must be higher than current
  if (planAction === 'upgrade' && targetPlan) {
    if (TIER_ORDER.indexOf(targetPlan as PlanTier) <= TIER_ORDER.indexOf(currentPlan as PlanTier)) {
      return `Cannot upgrade: ${targetPlan} is not higher than current plan ${currentPlan}`
    }
  }

  // For downgrades: target must be lower than current
  if ((planAction === 'downgrade_immediate' || planAction === 'downgrade_grace') && targetPlan) {
    if (TIER_ORDER.indexOf(targetPlan as PlanTier) >= TIER_ORDER.indexOf(currentPlan as PlanTier)) {
      return `Cannot downgrade: ${targetPlan} is not lower than current plan ${currentPlan}`
    }
  }

  return null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const { id } = await params
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, name: true, username: true, image: true,
        plan: true, role: true, isDisabled: true, createdAt: true,
        timezone: true, onboardingCompleted: true, emailVerified: true,
        subscriptionStatus: true, planActivatedAt: true, planExpiresAt: true,
        gracePeriodEndsAt: true, cleanupScheduledAt: true,
        downgradeReason: true, downgradeInitiatedBy: true,
        password: true,
        accounts: { select: { provider: true } },
        _count: { select: { bookingsAsHost: true, eventTypes: true, teamMemberships: true } },
        eventTypes: {
          select: {
            id: true, title: true, slug: true, isActive: true, lockedByDowngrade: true,
            teamId: true,
            team: { select: { name: true, slug: true } },
            _count: { select: { bookings: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        bookingsAsHost: {
          select: {
            id: true, startTime: true, endTime: true, status: true,
            inviteeName: true, inviteeEmail: true,
            eventType: {
              select: {
                title: true,
                teamId: true,
                team: { select: { name: true } },
              },
            },
          },
          orderBy: { startTime: 'desc' },
          take: 50,
        },
        teamMemberships: {
          select: {
            role: true,
            team: { select: { id: true, name: true, slug: true } },
          },
        },
        calendars: {
          select: { id: true, provider: true, name: true, syncStatus: true },
        },
        webhooks: {
          select: {
            id: true, name: true, url: true, isActive: true,
            lockedByDowngrade: true, eventTriggers: true, createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        supportTickets: {
          select: {
            id: true, subject: true, status: true, priority: true, createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        subscriptionHistory: {
          select: {
            id: true, action: true, fromPlan: true, toPlan: true,
            fromStatus: true, toStatus: true, reason: true, initiatedBy: true, createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { password, accounts, ...rest } = user
    return NextResponse.json({
      ...rest,
      hasPassword: !!password,
      authProviders: accounts.map((a) => a.provider),
    })
  } catch (error) {
    console.error('Admin user detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAdmin()
  if (error) return error

  // Rate limit admin mutations
  const rateLimit = await checkAdminRateLimit(session!.user.id)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString() } },
    )
  }

  try {
    const { id } = await params
    const body = await req.json()
    const validated = adminUpdateUserSchema.parse(body)

    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { plan: true, role: true, isDisabled: true, email: true, subscriptionStatus: true },
    })

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const adminId = session!.user.id

    // Handle subscription lifecycle actions
    if (validated.planAction) {
      // Validate transition is allowed for current status
      const transitionError = validateAdminTransition(
        validated.planAction,
        existingUser.subscriptionStatus,
        existingUser.plan,
        validated.plan,
      )
      if (transitionError) {
        return NextResponse.json({
          error: transitionError,
          code: 'INVALID_TRANSITION',
          currentStatus: existingUser.subscriptionStatus,
          currentPlan: existingUser.plan,
        }, { status: 400 })
      }

      try {
        switch (validated.planAction) {
          case 'upgrade': {
            if (!validated.plan || validated.plan === 'FREE') {
              return NextResponse.json({ error: 'Plan is required for upgrade' }, { status: 400 })
            }
            await activateSubscription(id, validated.plan as PlanTier, 30, `admin:${adminId}`)
            break
          }
          case 'downgrade_immediate': {
            const targetPlan = (validated.plan as PlanTier) || 'FREE'
            await adminDowngradeImmediate(id, adminId, targetPlan)
            break
          }
          case 'downgrade_grace': {
            const targetPlan = (validated.plan as PlanTier) || 'FREE'
            await adminDowngradeWithGrace(id, adminId, validated.gracePeriodDays, targetPlan)
            break
          }
          case 'cancel_downgrade': {
            await cancelDowngrade(id, `admin:${adminId}`)
            break
          }
        }

        await logAdminAction({
          adminId,
          action: 'UPDATE_USER',
          targetType: 'User',
          targetId: id,
          details: {
            planAction: validated.planAction,
            fromPlan: existingUser.plan,
            toPlan: validated.plan || 'FREE',
            gracePeriodDays: validated.gracePeriodDays,
            userEmail: existingUser.email,
          },
        })

      } catch (err: unknown) {
        if (err instanceof SubscriptionError) {
          return NextResponse.json({
            error: err.message,
            code: err.code,
            currentStatus: err.currentStatus,
            currentPlan: err.currentPlan,
          }, { status: 400 })
        }
        const message = err instanceof Error ? err.message : 'Failed to update subscription'
        return NextResponse.json({ error: message }, { status: 400 })
      }
    }

    // Handle direct plan change without planAction — route through lifecycle functions
    if (validated.plan && !validated.planAction && validated.plan !== existingUser.plan) {
      try {
        const newPlan = validated.plan as PlanTier
        const isUpgrade = TIER_ORDER.indexOf(newPlan) > TIER_ORDER.indexOf(existingUser.plan as PlanTier)
        const impliedAction = isUpgrade ? 'upgrade' : 'downgrade_immediate'

        // Validate the implied transition
        const transitionError = validateAdminTransition(
          impliedAction,
          existingUser.subscriptionStatus,
          existingUser.plan,
          newPlan,
        )
        if (transitionError) {
          return NextResponse.json({
            error: transitionError,
            code: 'INVALID_TRANSITION',
            currentStatus: existingUser.subscriptionStatus,
            currentPlan: existingUser.plan,
          }, { status: 400 })
        }

        if (isUpgrade) {
          await activateSubscription(id, newPlan, 30, `admin:${adminId}`)
        } else {
          await adminDowngradeImmediate(id, adminId, newPlan)
        }

        await logAdminAction({
          adminId,
          action: 'UPDATE_USER',
          targetType: 'User',
          targetId: id,
          details: {
            planAction: impliedAction,
            fromPlan: existingUser.plan,
            toPlan: newPlan,
            userEmail: existingUser.email,
          },
        })

      } catch (err: unknown) {
        if (err instanceof SubscriptionError) {
          return NextResponse.json({
            error: err.message,
            code: err.code,
            currentStatus: err.currentStatus,
            currentPlan: err.currentPlan,
          }, { status: 400 })
        }
        const message = err instanceof Error ? err.message : 'Failed to update plan'
        return NextResponse.json({ error: message }, { status: 400 })
      }
    }

    // Handle non-subscription field updates (role, isDisabled)
    const directUpdates: Record<string, unknown> = {}
    if (validated.role && validated.role !== existingUser.role) {
      directUpdates.role = validated.role
    }
    if (validated.isDisabled !== undefined && validated.isDisabled !== existingUser.isDisabled) {
      directUpdates.isDisabled = validated.isDisabled
    }

    if (Object.keys(directUpdates).length > 0) {
      await prisma.user.update({
        where: { id },
        data: directUpdates,
      })

      const changes: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(directUpdates)) {
        changes[key] = { from: (existingUser as Record<string, unknown>)[key], to: value }
      }

      await logAdminAction({
        adminId,
        action: 'UPDATE_USER',
        targetType: 'User',
        targetId: id,
        details: { changes, userEmail: existingUser.email },
      })
    }

    // Return updated user
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, name: true, plan: true, role: true, isDisabled: true,
        subscriptionStatus: true, planExpiresAt: true, gracePeriodEndsAt: true, cleanupScheduledAt: true,
      },
    })

    return NextResponse.json(user)
  } catch (error) {
    console.error('Admin user update error:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAdmin()
  if (error) return error

  try {
    const { id } = await params

    const user = await prisma.user.findUnique({
      where: { id },
      select: { email: true, role: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (user.role === 'ADMIN') {
      return NextResponse.json({ error: 'Cannot delete an admin user' }, { status: 403 })
    }

    await prisma.user.delete({ where: { id } })

    await logAdminAction({
      adminId: session!.user.id,
      action: 'DELETE_USER',
      targetType: 'User',
      targetId: id,
      details: { userEmail: user.email },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin user delete error:', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
