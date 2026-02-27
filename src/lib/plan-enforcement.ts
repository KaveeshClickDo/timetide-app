/**
 * Server-side plan enforcement utilities.
 * All limits are sourced from PLAN_LIMITS in pricing.ts — single source of truth.
 */

import { NextResponse } from 'next/server'
import { PLAN_LIMITS, getRequiredPlan, type PlanTier, type PlanLimits } from './pricing'

type NumericLimitKey = {
  [K in keyof PlanLimits]: PlanLimits[K] extends number ? K : never
}[keyof PlanLimits]

type BooleanFeatureKey = {
  [K in keyof PlanLimits]: PlanLimits[K] extends boolean ? K : never
}[keyof PlanLimits]

/**
 * Check if a numeric limit (maxEventTypes, maxCalendars, maxWebhooks) is exceeded.
 * Returns a 403 NextResponse if blocked, or null if allowed.
 */
export function checkNumericLimit(
  plan: PlanTier,
  limitKey: NumericLimitKey,
  currentCount: number,
): NextResponse | null {
  const limits = PLAN_LIMITS[plan]
  const max = limits[limitKey] as number

  if (max !== Infinity && currentCount >= max) {
    const requiredPlan = getUpgradePlanForNumeric(plan)
    return NextResponse.json(
      {
        error: `${formatLimitName(limitKey)} limit reached. Upgrade to create more.`,
        code: 'PLAN_LIMIT',
        requiredPlan,
        limit: max,
        current: currentCount,
      },
      { status: 403 },
    )
  }

  return null
}

/**
 * Check if a boolean feature (teams, analytics, bufferTimes, etc.) is allowed.
 * Returns a 403 NextResponse if blocked, or null if allowed.
 */
export function checkFeatureAccess(
  plan: PlanTier,
  featureKey: BooleanFeatureKey,
): NextResponse | null {
  const limits = PLAN_LIMITS[plan]
  const allowed = limits[featureKey] as boolean

  if (!allowed) {
    const requiredPlan = getRequiredPlan(featureKey)
    return NextResponse.json(
      {
        error: `${formatFeatureName(featureKey)} requires a ${requiredPlan} plan.`,
        code: 'PLAN_LIMIT',
        requiredPlan,
      },
      { status: 403 },
    )
  }

  return null
}

/**
 * Validate event type feature fields (bufferTimes, customQuestions, groupBooking, bookingLimits).
 * Used by both POST /api/event-types and PATCH /api/event-types/[id].
 * Returns a 403 NextResponse if any gated feature is used, or null if all allowed.
 */
export function checkEventTypeFeatures(
  plan: PlanTier,
  body: Record<string, unknown>,
): NextResponse | null {
  // Buffer times
  if ((body.bufferTimeBefore && (body.bufferTimeBefore as number) > 0) ||
      (body.bufferTimeAfter && (body.bufferTimeAfter as number) > 0)) {
    const denied = checkFeatureAccess(plan, 'bufferTimes')
    if (denied) return denied
  }

  // Custom questions
  if (body.questions && Array.isArray(body.questions) && body.questions.length > 0) {
    const denied = checkFeatureAccess(plan, 'customQuestions')
    if (denied) return denied
  }

  // Group booking
  if (body.seatsPerSlot && (body.seatsPerSlot as number) > 1) {
    const denied = checkFeatureAccess(plan, 'groupBooking')
    if (denied) return denied
  }

  // Booking limits
  if (body.maxBookingsPerDay != null) {
    const denied = checkFeatureAccess(plan, 'bookingLimits')
    if (denied) return denied
  }

  // Recurring booking
  if (body.allowsRecurring === true) {
    const denied = checkFeatureAccess(plan, 'recurringBooking')
    if (denied) return denied
  }

  return null
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getUpgradePlanForNumeric(currentPlan: PlanTier): PlanTier {
  const order: PlanTier[] = ['FREE', 'PRO', 'TEAM']
  const idx = order.indexOf(currentPlan)
  return idx < order.length - 1 ? order[idx + 1] : 'TEAM'
}

const LIMIT_LABELS: Record<NumericLimitKey, string> = {
  maxEventTypes: 'Event type',
  maxCalendars: 'Calendar',
  maxWebhooks: 'Webhook',
}

const FEATURE_LABELS: Record<BooleanFeatureKey, string> = {
  bufferTimes: 'Buffer times',
  customQuestions: 'Custom questions',
  groupBooking: 'Group booking',
  bookingLimits: 'Booking limits',
  recurringBooking: 'Recurring bookings',
  teams: 'Team scheduling',
  analytics: 'Analytics',
}

function formatLimitName(key: NumericLimitKey): string {
  return LIMIT_LABELS[key] || key
}

function formatFeatureName(key: BooleanFeatureKey): string {
  return FEATURE_LABELS[key] || key
}
