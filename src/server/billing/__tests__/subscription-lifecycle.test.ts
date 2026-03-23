import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Mock all external dependencies
// ============================================================================

const { prismaMock, createNotificationMock, queueEmailMock, scheduleWarningsMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    eventType: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    webhook: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    teamMember: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    subscriptionHistory: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
  createNotificationMock: vi.fn(),
  queueEmailMock: vi.fn(),
  scheduleWarningsMock: vi.fn(),
}))

vi.mock('@/server/db/prisma', () => ({ default: prismaMock }))

vi.mock('@/server/notifications', () => ({
  createNotification: createNotificationMock,
}))

vi.mock('@/generated/prisma/client', () => ({
  Prisma: { JsonNull: 'DbNull' as const },
}))

vi.mock('@/server/infrastructure/queue/email-queue', () => ({
  queueEmail: queueEmailMock,
}))

vi.mock('@/server/infrastructure/queue/subscription-queue', () => ({
  scheduleWarnings: scheduleWarningsMock,
}))

// ============================================================================
// Import module under test (after mocks)
// ============================================================================

import {
  SubscriptionError,
  activateSubscription,
  voluntaryUnsubscribe,
  startGracePeriod,
  adminDowngradeImmediate,
  adminDowngradeWithGrace,
  scheduleUserDowngrade,
  cancelDowngrade,
  lockResources,
  reactivateResources,
  getSubscriptionSummary,
} from '@/server/billing/subscription-lifecycle'

// ============================================================================
// Helpers
// ============================================================================

function mockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    plan: 'PRO',
    subscriptionStatus: 'ACTIVE',
    planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    email: 'test@example.com',
    name: 'Test User',
    ...overrides,
  }
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks()
  // Default: findUnique returns a PRO ACTIVE user
  prismaMock.user.findUnique.mockResolvedValue(mockUser())
  prismaMock.user.update.mockResolvedValue({})
  prismaMock.user.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.subscriptionHistory.create.mockResolvedValue({})
})

// ---------------------------------------------------------------------------
// SubscriptionError
// ---------------------------------------------------------------------------
describe('SubscriptionError', () => {
  it('carries code, currentStatus, and currentPlan', () => {
    const err = new SubscriptionError('test error', {
      code: 'INVALID_STATUS',
      currentStatus: 'ACTIVE',
      currentPlan: 'PRO',
    })
    expect(err.message).toBe('test error')
    expect(err.name).toBe('SubscriptionError')
    expect(err.code).toBe('INVALID_STATUS')
    expect(err.currentStatus).toBe('ACTIVE')
    expect(err.currentPlan).toBe('PRO')
    expect(err).toBeInstanceOf(Error)
  })
})

// ---------------------------------------------------------------------------
// activateSubscription
// ---------------------------------------------------------------------------
describe('activateSubscription', () => {
  it('activates a new subscription with ACTIVE status', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser({ subscriptionStatus: 'NONE', plan: 'FREE' }))
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test User' })

    await activateSubscription('user-1', 'PRO', 30, 'system')

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          plan: 'PRO',
          subscriptionStatus: 'ACTIVE',
          gracePeriodEndsAt: null,
          cleanupScheduledAt: null,
        }),
      }),
    )
  })

  it('reactivates locked resources when upgrading from LOCKED', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser({ subscriptionStatus: 'LOCKED', plan: 'FREE' }))
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test User' })

    await activateSubscription('user-1', 'PRO', 30, 'system')

    // Should unlock personal event types
    expect(prismaMock.eventType.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', lockedByDowngrade: true },
        data: { isActive: true, lockedByDowngrade: false },
      }),
    )
    // Should unlock webhooks
    expect(prismaMock.webhook.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', lockedByDowngrade: true },
        data: { isActive: true, lockedByDowngrade: false },
      }),
    )
  })

  it('accepts a Date for precise Stripe period end sync', async () => {
    const exactExpiry = new Date('2026-05-01T00:00:00Z')
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser({ subscriptionStatus: 'NONE', plan: 'FREE' }))
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test User' })

    await activateSubscription('user-1', 'PRO', exactExpiry, 'stripe')

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          planExpiresAt: exactExpiry,
        }),
      }),
    )
  })

  it('throws if user not found', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null)
    await expect(activateSubscription('no-user', 'PRO')).rejects.toThrow('User not found')
  })

  it('logs subscription history', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser({ subscriptionStatus: 'NONE', plan: 'FREE' }))
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test User' })

    await activateSubscription('user-1', 'PRO', 30, 'system')

    expect(prismaMock.subscriptionHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          action: 'upgrade',
          fromPlan: 'FREE',
          toPlan: 'PRO',
          toStatus: 'ACTIVE',
        }),
      }),
    )
  })

  it('creates a notification', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser({ subscriptionStatus: 'NONE', plan: 'FREE' }))
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test User' })

    await activateSubscription('user-1', 'PRO', 30, 'system')

    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: 'PLAN_REACTIVATED',
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// voluntaryUnsubscribe
// ---------------------------------------------------------------------------
describe('voluntaryUnsubscribe', () => {
  it('sets status to UNSUBSCRIBED', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser())
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test User' })

    await voluntaryUnsubscribe('user-1')

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionStatus: 'UNSUBSCRIBED',
          downgradeReason: 'voluntary_unsub',
        }),
      }),
    )
  })

  it('throws SubscriptionError if not ACTIVE', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(mockUser({ subscriptionStatus: 'LOCKED' }))

    await expect(voluntaryUnsubscribe('user-1')).rejects.toThrow(SubscriptionError)
  })

  it('throws SubscriptionError with correct fields when not ACTIVE', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(
      mockUser({ subscriptionStatus: 'GRACE_PERIOD', plan: 'TEAM' }),
    )

    try {
      await voluntaryUnsubscribe('user-1')
      expect.unreachable('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(SubscriptionError)
      const subErr = err as SubscriptionError
      expect(subErr.code).toBe('INVALID_STATUS')
      expect(subErr.currentStatus).toBe('GRACE_PERIOD')
      expect(subErr.currentPlan).toBe('TEAM')
    }
  })

  it('sends cancellation email', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser())
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test User' })

    await voluntaryUnsubscribe('user-1')

    expect(queueEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'subscription_cancelled',
        to: 'test@example.com',
      }),
    )
  })

  it('throws if user not found', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null)
    await expect(voluntaryUnsubscribe('no-user')).rejects.toThrow('User not found')
  })
})

// ---------------------------------------------------------------------------
// startGracePeriod
// ---------------------------------------------------------------------------
describe('startGracePeriod', () => {
  it('transitions ACTIVE → GRACE_PERIOD', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser())
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test User' })

    await startGracePeriod('user-1', 7)

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionStatus: 'GRACE_PERIOD',
          downgradeReason: 'payment_failed',
        }),
      }),
    )
  })

  it('transitions UNSUBSCRIBED → GRACE_PERIOD with voluntary reason', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser({ subscriptionStatus: 'UNSUBSCRIBED' }))
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test User' })

    await startGracePeriod('user-1', 7)

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionStatus: 'GRACE_PERIOD',
          downgradeReason: 'voluntary_unsub',
        }),
      }),
    )
  })

  it('does nothing if already LOCKED', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(mockUser({ subscriptionStatus: 'LOCKED' }))

    await startGracePeriod('user-1')

    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('does nothing if user not found', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null)

    await startGracePeriod('user-1')

    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('sets gracePeriodEndsAt based on graceDays', async () => {
    const now = Date.now()
    vi.setSystemTime(now)

    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser())
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test User' })

    await startGracePeriod('user-1', 14)

    const updateCall = prismaMock.user.update.mock.calls[0][0]
    const gracePeriodEndsAt = updateCall.data.gracePeriodEndsAt as Date
    const expectedMs = now + 14 * 24 * 60 * 60 * 1000
    // Allow 1 second tolerance
    expect(Math.abs(gracePeriodEndsAt.getTime() - expectedMs)).toBeLessThan(1000)

    vi.useRealTimers()
  })

  it('schedules grace ending warnings', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser())
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test User' })

    await startGracePeriod('user-1', 7)

    expect(scheduleWarningsMock).toHaveBeenCalledWith(
      'user-1',
      'grace_ending',
      expect.any(Array),
    )
  })
})

// ---------------------------------------------------------------------------
// adminDowngradeImmediate
// ---------------------------------------------------------------------------
describe('adminDowngradeImmediate', () => {
  it('locks resources and sets LOCKED status for paid → FREE', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser({ plan: 'PRO', subscriptionStatus: 'ACTIVE' })) // adminDowngradeImmediate lookup
      .mockResolvedValueOnce(mockUser({ plan: 'PRO', subscriptionStatus: 'ACTIVE' })) // lockResources lookup
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test User' }) // lockResources email
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test User' }) // adminDowngrade email

    await adminDowngradeImmediate('user-1', 'admin-1', 'FREE')

    // lockResources sets plan to FREE + LOCKED
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          plan: 'FREE',
          subscriptionStatus: 'LOCKED',
        }),
      }),
    )
  })

  it('keeps ACTIVE status for paid → paid downgrade (TEAM → PRO)', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser({ plan: 'TEAM', subscriptionStatus: 'ACTIVE' }))
      .mockResolvedValueOnce(mockUser({ plan: 'TEAM', subscriptionStatus: 'ACTIVE' }))
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test User' })

    await adminDowngradeImmediate('user-1', 'admin-1', 'PRO')

    // After lockResources, should override status back to ACTIVE
    const updateCalls = prismaMock.user.update.mock.calls
    const lastUpdate = updateCalls[updateCalls.length - 1][0]
    expect(lastUpdate.data).toEqual(
      expect.objectContaining({
        subscriptionStatus: 'ACTIVE',
        cleanupScheduledAt: null,
      }),
    )
  })

  it('creates downgrade notification', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser())
      .mockResolvedValueOnce(mockUser())
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test User' })
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test User' })

    await adminDowngradeImmediate('user-1', 'admin-1', 'FREE')

    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: 'PLAN_DOWNGRADED',
      }),
    )
  })

  it('throws if user not found', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null)
    await expect(adminDowngradeImmediate('no-user', 'admin-1')).rejects.toThrow('User not found')
  })
})

// ---------------------------------------------------------------------------
// adminDowngradeWithGrace
// ---------------------------------------------------------------------------
describe('adminDowngradeWithGrace', () => {
  it('sets DOWNGRADING status with grace period', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser())
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test User' })

    await adminDowngradeWithGrace('user-1', 'admin-1', 14, 'FREE')

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionStatus: 'DOWNGRADING',
          downgradeReason: 'admin_grace',
          downgradeInitiatedBy: 'admin:admin-1',
        }),
      }),
    )
  })

  it('defaults graceDays to remaining billing period', async () => {
    const expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser({ planExpiresAt: expiresAt }))
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test User' })

    await adminDowngradeWithGrace('user-1', 'admin-1', undefined, 'FREE')

    const updateCall = prismaMock.user.update.mock.calls[0][0]
    const gracePeriodEndsAt = updateCall.data.gracePeriodEndsAt as Date
    // Should be roughly 15 days from now (within 1 day tolerance due to rounding)
    const daysUntilGraceEnds = (gracePeriodEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    expect(daysUntilGraceEnds).toBeGreaterThan(13)
    expect(daysUntilGraceEnds).toBeLessThan(17)
  })

  it('defaults to 30 days when no planExpiresAt', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser({ planExpiresAt: null }))
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test User' })

    await adminDowngradeWithGrace('user-1', 'admin-1', undefined, 'FREE')

    const updateCall = prismaMock.user.update.mock.calls[0][0]
    const gracePeriodEndsAt = updateCall.data.gracePeriodEndsAt as Date
    const daysUntilGraceEnds = (gracePeriodEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    expect(daysUntilGraceEnds).toBeGreaterThan(29)
    expect(daysUntilGraceEnds).toBeLessThan(31)
  })

  it('sends admin_downgrade_grace_notice email', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser())
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test User' })

    await adminDowngradeWithGrace('user-1', 'admin-1', 7, 'FREE')

    expect(queueEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'admin_downgrade_grace_notice',
        to: 'test@example.com',
      }),
    )
  })

  it('throws if user not found', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null)
    await expect(adminDowngradeWithGrace('no-user', 'admin-1')).rejects.toThrow('User not found')
  })
})

// ---------------------------------------------------------------------------
// scheduleUserDowngrade
// ---------------------------------------------------------------------------
describe('scheduleUserDowngrade', () => {
  it('sets DOWNGRADING status with planExpiresAt as switchDate', async () => {
    const expiresAt = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)
    prismaMock.user.findUnique.mockResolvedValueOnce(
      mockUser({ subscriptionStatus: 'UNSUBSCRIBED', planExpiresAt: expiresAt }),
    )

    const result = await scheduleUserDowngrade('user-1', 'FREE')

    expect(result.switchDate).toEqual(expiresAt)
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1', subscriptionStatus: 'UNSUBSCRIBED' },
        data: expect.objectContaining({
          subscriptionStatus: 'DOWNGRADING',
          downgradeReason: 'user_scheduled_downgrade',
          downgradeInitiatedBy: 'user',
        }),
      }),
    )
  })

  it('throws SubscriptionError if not UNSUBSCRIBED', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(mockUser({ subscriptionStatus: 'ACTIVE' }))

    await expect(scheduleUserDowngrade('user-1', 'FREE')).rejects.toThrow(SubscriptionError)
  })

  it('throws if planExpiresAt is in the past', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(
      mockUser({
        subscriptionStatus: 'UNSUBSCRIBED',
        planExpiresAt: new Date(Date.now() - 1000),
      }),
    )

    await expect(scheduleUserDowngrade('user-1', 'FREE')).rejects.toThrow(
      'No active billing period',
    )
  })

  it('throws if planExpiresAt is null', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(
      mockUser({ subscriptionStatus: 'UNSUBSCRIBED', planExpiresAt: null }),
    )

    await expect(scheduleUserDowngrade('user-1', 'FREE')).rejects.toThrow(
      'No active billing period',
    )
  })

  it('throws if race condition (updateMany returns 0)', async () => {
    const expiresAt = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)
    prismaMock.user.findUnique.mockResolvedValueOnce(
      mockUser({ subscriptionStatus: 'UNSUBSCRIBED', planExpiresAt: expiresAt }),
    )
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 0 })

    await expect(scheduleUserDowngrade('user-1', 'FREE')).rejects.toThrow(
      'Subscription status has already changed',
    )
  })
})

// ---------------------------------------------------------------------------
// cancelDowngrade
// ---------------------------------------------------------------------------
describe('cancelDowngrade', () => {
  it('restores ACTIVE status', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser({ subscriptionStatus: 'DOWNGRADING' }))
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test User' })

    await cancelDowngrade('user-1', 'user')

    expect(prismaMock.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1', subscriptionStatus: 'DOWNGRADING' },
        data: expect.objectContaining({
          subscriptionStatus: 'ACTIVE',
          gracePeriodEndsAt: null,
          downgradeReason: null,
        }),
      }),
    )
  })

  it('throws SubscriptionError if not DOWNGRADING', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(mockUser({ subscriptionStatus: 'ACTIVE' }))

    await expect(cancelDowngrade('user-1')).rejects.toThrow(SubscriptionError)
  })

  it('throws if race condition (updateMany returns 0)', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(
      mockUser({ subscriptionStatus: 'DOWNGRADING' }),
    )
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 0 })

    await expect(cancelDowngrade('user-1')).rejects.toThrow(
      'Subscription status has already changed',
    )
  })

  it('sends downgrade_cancelled email', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser({ subscriptionStatus: 'DOWNGRADING' }))
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test User' })

    await cancelDowngrade('user-1')

    expect(queueEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'downgrade_cancelled',
        to: 'test@example.com',
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// lockResources
// ---------------------------------------------------------------------------
describe('lockResources', () => {
  it('locks excess personal event types beyond FREE limit', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(mockUser())
    prismaMock.eventType.findMany.mockResolvedValueOnce([
      { id: 'et-1', isActive: true },
      { id: 'et-2', isActive: true },
      { id: 'et-3', isActive: true },
    ])
    // email lookup
    prismaMock.user.findUnique.mockResolvedValueOnce({ email: 'test@example.com', name: 'Test' })

    const result = await lockResources('user-1', 'FREE')

    // FREE allows 1 event type, so 2 should be locked
    expect(prismaMock.eventType.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['et-2', 'et-3'] } },
        data: { isActive: false, lockedByDowngrade: true },
      }),
    )
    expect(result.lockedPersonalEvents).toBe(2)
  })

  it('locks ALL webhooks when downgrading to FREE (maxWebhooks=0)', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser())
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test' })
    prismaMock.webhook.updateMany.mockResolvedValueOnce({ count: 5 })

    const result = await lockResources('user-1', 'FREE')

    expect(prismaMock.webhook.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', isActive: true },
        data: { isActive: false, lockedByDowngrade: true },
      }),
    )
    expect(result.lockedWebhookCount).toBe(5)
  })

  it('locks excess webhooks for TEAM → PRO (keeps 10)', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser({ plan: 'TEAM' }))
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test' })

    const webhooks = Array.from({ length: 15 }, (_, i) => ({ id: `wh-${i}` }))
    prismaMock.webhook.findMany.mockResolvedValueOnce(webhooks)

    const result = await lockResources('user-1', 'PRO')

    // PRO allows 10 webhooks, so 5 should be locked
    expect(prismaMock.webhook.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['wh-10', 'wh-11', 'wh-12', 'wh-13', 'wh-14'] } },
      }),
    )
    expect(result.lockedWebhookCount).toBe(5)
  })

  it('locks team event types when target plan has no teams', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser({ plan: 'TEAM' }))
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test' })
    prismaMock.teamMember.findMany
      .mockResolvedValueOnce([{ teamId: 'team-1' }]) // owned teams
      .mockResolvedValueOnce([]) // team members to notify

    // PRO has Infinity event types so no personal lock call happens.
    // PRO has maxWebhooks=10, so webhook.findMany is called (returns empty default).
    // Team event lock is the first eventType.updateMany call.
    prismaMock.eventType.updateMany.mockResolvedValueOnce({ count: 3 })

    const result = await lockResources('user-1', 'PRO')

    expect(result.lockedTeamEvents).toBe(3)
  })

  it('sets user to LOCKED status with target plan', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(mockUser())
      .mockResolvedValueOnce({ email: 'test@example.com', name: 'Test' })

    await lockResources('user-1', 'FREE', 'payment_failed', 'system')

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          plan: 'FREE',
          subscriptionStatus: 'LOCKED',
          downgradeReason: 'payment_failed',
        }),
      }),
    )
  })

  it('skips notifications when skipNotifications=true', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(mockUser())

    await lockResources('user-1', 'FREE', 'admin_immediate', 'admin:1', true)

    expect(createNotificationMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PLAN_LOCKED' }),
    )
  })

  it('returns zeros if user not found', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null)

    const result = await lockResources('user-1')

    expect(result).toEqual({ lockedPersonalEvents: 0, lockedTeamEvents: 0, lockedWebhookCount: 0 })
  })
})

// ---------------------------------------------------------------------------
// reactivateResources
// ---------------------------------------------------------------------------
describe('reactivateResources', () => {
  it('reactivates personal event types and webhooks', async () => {
    prismaMock.teamMember.findMany.mockResolvedValueOnce([])

    await reactivateResources('user-1')

    expect(prismaMock.eventType.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', lockedByDowngrade: true },
      data: { isActive: true, lockedByDowngrade: false },
    })
    expect(prismaMock.webhook.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', lockedByDowngrade: true },
      data: { isActive: true, lockedByDowngrade: false },
    })
  })

  it('reactivates team event types for owned teams', async () => {
    prismaMock.teamMember.findMany
      .mockResolvedValueOnce([{ teamId: 'team-1' }]) // owned teams
      .mockResolvedValueOnce([{ userId: 'member-1' }]) // team members to notify

    await reactivateResources('user-1')

    expect(prismaMock.eventType.updateMany).toHaveBeenCalledWith({
      where: { teamId: { in: ['team-1'] }, lockedByDowngrade: true },
      data: { isActive: true, lockedByDowngrade: false },
    })
  })

  it('notifies team members when team resources reactivated', async () => {
    prismaMock.teamMember.findMany
      .mockResolvedValueOnce([{ teamId: 'team-1' }])
      .mockResolvedValueOnce([{ userId: 'member-1' }, { userId: 'member-2' }])

    await reactivateResources('user-1')

    expect(createNotificationMock).toHaveBeenCalledTimes(2)
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'member-1',
        type: 'PLAN_REACTIVATED',
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// getSubscriptionSummary
// ---------------------------------------------------------------------------
describe('getSubscriptionSummary', () => {
  it('returns user subscription data with locked counts', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      plan: 'FREE',
      subscriptionStatus: 'LOCKED',
      planActivatedAt: new Date(),
      planExpiresAt: null,
      gracePeriodEndsAt: null,
      cleanupScheduledAt: null,
      downgradeReason: 'payment_failed',
      downgradeInitiatedBy: 'system',
    })
    prismaMock.eventType.count.mockResolvedValueOnce(3)
    prismaMock.webhook.count.mockResolvedValueOnce(2)
    prismaMock.subscriptionHistory.findMany.mockResolvedValueOnce([])

    const result = await getSubscriptionSummary('user-1')

    expect(result).toEqual(
      expect.objectContaining({
        plan: 'FREE',
        subscriptionStatus: 'LOCKED',
        lockedEventTypes: 3,
        lockedWebhooks: 2,
      }),
    )
  })

  it('returns null if user not found', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null)

    const result = await getSubscriptionSummary('no-user')

    expect(result).toBeNull()
  })
})
