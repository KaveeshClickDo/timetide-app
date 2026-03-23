import { describe, it, expect, vi } from 'vitest'

// ============================================================================
// Mock Prisma (needed for createNotification import)
// ============================================================================

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    notification: {
      create: vi.fn(),
    },
  },
}))

vi.mock('@/server/db/prisma', () => ({ default: prismaMock }))

// ============================================================================
// Import module under test
// ============================================================================

import {
  createNotification,
  buildBookingNotification,
  buildTeamNotification,
  buildPlanNotification,
} from '@/server/notifications'

// ============================================================================
// createNotification
// ============================================================================
describe('createNotification', () => {
  it('creates a notification via Prisma', async () => {
    prismaMock.notification.create.mockResolvedValueOnce({})

    await createNotification({
      userId: 'user-1',
      type: 'BOOKING_CREATED',
      title: 'New booking',
      message: 'You have a new booking',
    })

    expect(prismaMock.notification.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        type: 'BOOKING_CREATED',
        title: 'New booking',
        message: 'You have a new booking',
        bookingId: null,
      },
    })
  })

  it('passes bookingId when provided', async () => {
    prismaMock.notification.create.mockResolvedValueOnce({})

    await createNotification({
      userId: 'user-1',
      type: 'BOOKING_CONFIRMED',
      title: 'Confirmed',
      message: 'Booking confirmed',
      bookingId: 'booking-1',
    })

    expect(prismaMock.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingId: 'booking-1',
      }),
    })
  })
})

// ============================================================================
// buildBookingNotification
// ============================================================================
describe('buildBookingNotification', () => {
  const data = {
    inviteeName: 'Bob',
    eventTitle: '1:1 Meeting',
    startTime: 'March 19, 2026 2:00 PM',
  }

  it('BOOKING_CREATED', () => {
    const result = buildBookingNotification('BOOKING_CREATED', data)
    expect(result.title).toBe('New booking received')
    expect(result.message).toContain('Bob')
    expect(result.message).toContain('1:1 Meeting')
    expect(result.message).toContain('March 19')
  })

  it('BOOKING_CONFIRMED', () => {
    const result = buildBookingNotification('BOOKING_CONFIRMED', data)
    expect(result.title).toBe('Booking confirmed')
    expect(result.message).toContain('confirmed')
  })

  it('BOOKING_REJECTED', () => {
    const result = buildBookingNotification('BOOKING_REJECTED', data)
    expect(result.title).toBe('Booking rejected')
    expect(result.message).toContain('rejected')
  })

  it('BOOKING_CANCELLED', () => {
    const result = buildBookingNotification('BOOKING_CANCELLED', data)
    expect(result.title).toBe('Booking cancelled')
    expect(result.message).toContain('cancelled')
  })

  it('BOOKING_RESCHEDULED', () => {
    const result = buildBookingNotification('BOOKING_RESCHEDULED', data)
    expect(result.title).toBe('Booking rescheduled')
    expect(result.message).toContain('rescheduled to')
  })

  it('BOOKING_REMINDER', () => {
    const result = buildBookingNotification('BOOKING_REMINDER', data)
    expect(result.title).toBe('Upcoming meeting')
    expect(result.message).toContain('starts at')
  })

  it('returns fallback for unknown type', () => {
    const result = buildBookingNotification('UNKNOWN_TYPE' as never, data)
    expect(result.title).toBe('Notification')
    expect(result.message).toBe('')
  })
})

// ============================================================================
// buildTeamNotification
// ============================================================================
describe('buildTeamNotification', () => {
  it('TEAM_MEMBER_ADDED without role', () => {
    const result = buildTeamNotification('TEAM_MEMBER_ADDED', {
      teamName: 'Engineering',
      actorName: 'Alice',
    })
    expect(result.title).toBe('Added to team')
    expect(result.message).toContain('Engineering')
    expect(result.message).toContain('Alice')
    expect(result.message).not.toContain('as')
  })

  it('TEAM_MEMBER_ADDED with role', () => {
    const result = buildTeamNotification('TEAM_MEMBER_ADDED', {
      teamName: 'Engineering',
      actorName: 'Alice',
      role: 'ADMIN',
    })
    expect(result.message).toContain('as ADMIN')
  })

  it('TEAM_INVITATION_RECEIVED without role', () => {
    const result = buildTeamNotification('TEAM_INVITATION_RECEIVED', {
      teamName: 'Design',
      actorName: 'Bob',
    })
    expect(result.title).toBe('Team invitation')
    expect(result.message).toContain('Bob')
    expect(result.message).toContain('Design')
  })

  it('TEAM_INVITATION_RECEIVED with role', () => {
    const result = buildTeamNotification('TEAM_INVITATION_RECEIVED', {
      teamName: 'Design',
      actorName: 'Bob',
      role: 'MEMBER',
    })
    expect(result.message).toContain('as MEMBER')
  })
})

// ============================================================================
// buildPlanNotification
// ============================================================================
describe('buildPlanNotification', () => {
  it('PLAN_EXPIRING_SOON', () => {
    const result = buildPlanNotification('PLAN_EXPIRING_SOON', {
      plan: 'PRO',
      expiresAt: 'April 1, 2026',
    })
    expect(result.title).toBe('Plan expiring soon')
    expect(result.message).toContain('PRO')
    expect(result.message).toContain('April 1, 2026')
  })

  it('PLAN_GRACE_PERIOD_STARTED', () => {
    const result = buildPlanNotification('PLAN_GRACE_PERIOD_STARTED', { plan: 'PRO' })
    expect(result.title).toBe('Billing period ended')
    expect(result.message).toContain('7 days')
  })

  it('PLAN_GRACE_PERIOD_ENDING with 1 day left', () => {
    const result = buildPlanNotification('PLAN_GRACE_PERIOD_ENDING', { daysLeft: 1 })
    expect(result.title).toBe('Grace period ending soon')
    expect(result.message).toContain('tomorrow')
  })

  it('PLAN_GRACE_PERIOD_ENDING with multiple days left', () => {
    const result = buildPlanNotification('PLAN_GRACE_PERIOD_ENDING', { daysLeft: 3 })
    expect(result.message).toContain('in 3 days')
  })

  it('PLAN_LOCKED with counts', () => {
    const result = buildPlanNotification('PLAN_LOCKED', {
      plan: 'PRO',
      lockedEvents: 5,
      lockedWebhooks: 3,
    })
    expect(result.title).toBe('PRO features locked')
    expect(result.message).toContain('5 event type(s)')
    expect(result.message).toContain('3 webhook(s)')
  })

  it('PLAN_LOCKED with default zeros', () => {
    const result = buildPlanNotification('PLAN_LOCKED', {})
    expect(result.title).toBe('PRO features locked')
    expect(result.message).toContain('0 event type(s)')
  })

  it('PLAN_CLEANUP_WARNING', () => {
    const result = buildPlanNotification('PLAN_CLEANUP_WARNING', {})
    expect(result.title).toBe('Plan update')
    expect(result.message).toContain('billing page')
  })

  it('PLAN_DOWNGRADED', () => {
    const result = buildPlanNotification('PLAN_DOWNGRADED', {})
    expect(result.title).toBe('Plan downgraded')
    expect(result.message).toContain('FREE')
  })

  it('PLAN_REACTIVATED', () => {
    const result = buildPlanNotification('PLAN_REACTIVATED', { plan: 'TEAM' })
    expect(result.title).toBe('Subscription reactivated')
    expect(result.message).toContain('TEAM')
    expect(result.message).toContain('restored')
  })

  it('returns fallback for unknown type', () => {
    const result = buildPlanNotification('UNKNOWN' as never, {})
    expect(result.title).toBe('Plan update')
    expect(result.message).toContain('subscription status has changed')
  })
})
