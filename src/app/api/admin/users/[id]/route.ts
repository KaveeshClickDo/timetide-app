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
} from '@/lib/subscription-lifecycle'
import type { PlanTier } from '@/lib/pricing'
import { syncAdminPlanAction } from '@/lib/stripe-admin-sync'

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

  try {
    const { id } = await params
    const body = await req.json()
    const validated = adminUpdateUserSchema.parse(body)

    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { plan: true, role: true, isDisabled: true, email: true },
    })

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const adminId = session!.user.id

    // Handle subscription lifecycle actions
    if (validated.planAction) {
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

        // Sync admin action to Stripe (non-blocking — admin action succeeds even if Stripe fails)
        await syncAdminPlanAction(id, validated.planAction, (validated.plan as PlanTier) || 'FREE').catch((err) => {
          console.error('[admin] Stripe sync failed (non-blocking):', err)
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update subscription'
        return NextResponse.json({ error: message }, { status: 400 })
      }
    }

    // Handle non-subscription field updates (role, isDisabled, or direct plan change without planAction)
    const directUpdates: Record<string, unknown> = {}
    if (validated.role && validated.role !== existingUser.role) {
      directUpdates.role = validated.role
    }
    if (validated.isDisabled !== undefined && validated.isDisabled !== existingUser.isDisabled) {
      directUpdates.isDisabled = validated.isDisabled
    }
    // Backward compat: direct plan change without planAction
    if (validated.plan && !validated.planAction && validated.plan !== existingUser.plan) {
      directUpdates.plan = validated.plan
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
