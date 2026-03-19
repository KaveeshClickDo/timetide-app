import { describe, it, expect } from 'vitest'
import {
  PRICING_TIERS,
  PLAN_LIMITS,
  FEATURE_LABELS,
  getPlanByTier,
  getUpgradeTier,
  getPlanLimits,
  getRequiredPlan,
  getPlanBadgeStyles,
} from '../pricing'

// ---------------------------------------------------------------------------
// PRICING_TIERS constant
// ---------------------------------------------------------------------------
describe('PRICING_TIERS', () => {
  it('has exactly 3 tiers', () => {
    expect(PRICING_TIERS).toHaveLength(3)
  })

  it('tiers are in order: FREE, PRO, TEAM', () => {
    expect(PRICING_TIERS.map((t) => t.id)).toEqual(['FREE', 'PRO', 'TEAM'])
  })

  it('FREE tier has price 0', () => {
    const free = PRICING_TIERS.find((t) => t.id === 'FREE')!
    expect(free.price).toBe(0)
  })

  it('PRO tier is marked as popular', () => {
    const pro = PRICING_TIERS.find((t) => t.id === 'PRO')!
    expect(pro.isPopular).toBe(true)
  })

  it('only PRO is popular', () => {
    const popularTiers = PRICING_TIERS.filter((t) => t.isPopular)
    expect(popularTiers).toHaveLength(1)
    expect(popularTiers[0].id).toBe('PRO')
  })

  it('all tiers have features list', () => {
    for (const tier of PRICING_TIERS) {
      expect(tier.features.length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// PLAN_LIMITS constant
// ---------------------------------------------------------------------------
describe('PLAN_LIMITS', () => {
  it('FREE has 1 event type and 0 webhooks', () => {
    expect(PLAN_LIMITS.FREE.maxEventTypes).toBe(1)
    expect(PLAN_LIMITS.FREE.maxWebhooks).toBe(0)
  })

  it('FREE has no premium features', () => {
    expect(PLAN_LIMITS.FREE.customQuestions).toBe(false)
    expect(PLAN_LIMITS.FREE.groupBooking).toBe(false)
    expect(PLAN_LIMITS.FREE.recurringBooking).toBe(false)
    expect(PLAN_LIMITS.FREE.teams).toBe(false)
    expect(PLAN_LIMITS.FREE.analytics).toBe(false)
  })

  it('PRO has unlimited event types and 10 webhooks', () => {
    expect(PLAN_LIMITS.PRO.maxEventTypes).toBe(999999)
    expect(PLAN_LIMITS.PRO.maxWebhooks).toBe(10)
  })

  it('PRO has booking features but no teams/analytics', () => {
    expect(PLAN_LIMITS.PRO.customQuestions).toBe(true)
    expect(PLAN_LIMITS.PRO.groupBooking).toBe(true)
    expect(PLAN_LIMITS.PRO.recurringBooking).toBe(true)
    expect(PLAN_LIMITS.PRO.teams).toBe(false)
    expect(PLAN_LIMITS.PRO.analytics).toBe(false)
  })

  it('TEAM has everything unlimited', () => {
    expect(PLAN_LIMITS.TEAM.maxEventTypes).toBe(999999)
    expect(PLAN_LIMITS.TEAM.maxWebhooks).toBe(999999)
    expect(PLAN_LIMITS.TEAM.customQuestions).toBe(true)
    expect(PLAN_LIMITS.TEAM.groupBooking).toBe(true)
    expect(PLAN_LIMITS.TEAM.recurringBooking).toBe(true)
    expect(PLAN_LIMITS.TEAM.teams).toBe(true)
    expect(PLAN_LIMITS.TEAM.analytics).toBe(true)
  })

  it('each higher tier is a superset of the lower tier', () => {
    // PRO >= FREE
    expect(PLAN_LIMITS.PRO.maxEventTypes).toBeGreaterThanOrEqual(PLAN_LIMITS.FREE.maxEventTypes)
    expect(PLAN_LIMITS.PRO.maxWebhooks).toBeGreaterThanOrEqual(PLAN_LIMITS.FREE.maxWebhooks)
    // TEAM >= PRO
    expect(PLAN_LIMITS.TEAM.maxEventTypes).toBeGreaterThanOrEqual(PLAN_LIMITS.PRO.maxEventTypes)
    expect(PLAN_LIMITS.TEAM.maxWebhooks).toBeGreaterThanOrEqual(PLAN_LIMITS.PRO.maxWebhooks)
  })
})

// ---------------------------------------------------------------------------
// getPlanByTier
// ---------------------------------------------------------------------------
describe('getPlanByTier', () => {
  it('returns correct tier for FREE', () => {
    expect(getPlanByTier('FREE').id).toBe('FREE')
    expect(getPlanByTier('FREE').name).toBe('Free')
  })

  it('returns correct tier for PRO', () => {
    expect(getPlanByTier('PRO').id).toBe('PRO')
    expect(getPlanByTier('PRO').price).toBe(12)
  })

  it('returns correct tier for TEAM', () => {
    expect(getPlanByTier('TEAM').id).toBe('TEAM')
    expect(getPlanByTier('TEAM').price).toBe(20)
  })

  it('returns a tier object for any input', () => {
    // getPlanByTier builds a tier from the given string (no fallback to FREE)
    // @ts-expect-error testing invalid input
    expect(getPlanByTier('INVALID').id).toBe('INVALID')
  })
})

// ---------------------------------------------------------------------------
// getUpgradeTier
// ---------------------------------------------------------------------------
describe('getUpgradeTier', () => {
  it('FREE → PRO', () => {
    const result = getUpgradeTier('FREE')
    expect(result).not.toBeNull()
    expect(result!.id).toBe('PRO')
  })

  it('PRO → TEAM', () => {
    const result = getUpgradeTier('PRO')
    expect(result).not.toBeNull()
    expect(result!.id).toBe('TEAM')
  })

  it('TEAM → null (highest tier)', () => {
    expect(getUpgradeTier('TEAM')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getPlanLimits
// ---------------------------------------------------------------------------
describe('getPlanLimits', () => {
  it('returns limits for each plan', () => {
    expect(getPlanLimits('FREE')).toBe(PLAN_LIMITS.FREE)
    expect(getPlanLimits('PRO')).toBe(PLAN_LIMITS.PRO)
    expect(getPlanLimits('TEAM')).toBe(PLAN_LIMITS.TEAM)
  })
})

// ---------------------------------------------------------------------------
// getRequiredPlan
// ---------------------------------------------------------------------------
describe('getRequiredPlan', () => {
  it('customQuestions requires PRO', () => {
    expect(getRequiredPlan('customQuestions')).toBe('PRO')
  })

  it('groupBooking requires PRO', () => {
    expect(getRequiredPlan('groupBooking')).toBe('PRO')
  })

  it('recurringBooking requires PRO', () => {
    expect(getRequiredPlan('recurringBooking')).toBe('PRO')
  })

  it('teams requires TEAM', () => {
    expect(getRequiredPlan('teams')).toBe('TEAM')
  })

  it('analytics requires TEAM', () => {
    expect(getRequiredPlan('analytics')).toBe('TEAM')
  })
})

// ---------------------------------------------------------------------------
// getPlanBadgeStyles
// ---------------------------------------------------------------------------
describe('getPlanBadgeStyles', () => {
  it('PRO returns ocean styles', () => {
    const styles = getPlanBadgeStyles('PRO')
    expect(styles).toContain('ocean')
  })

  it('TEAM returns purple styles', () => {
    const styles = getPlanBadgeStyles('TEAM')
    expect(styles).toContain('purple')
  })

  it('FREE returns gray styles', () => {
    const styles = getPlanBadgeStyles('FREE')
    expect(styles).toContain('gray')
  })
})

// ---------------------------------------------------------------------------
// FEATURE_LABELS constant
// ---------------------------------------------------------------------------
describe('FEATURE_LABELS', () => {
  it('has a label for every PlanLimits key', () => {
    const limitKeys = Object.keys(PLAN_LIMITS.FREE)
    const labelKeys = Object.keys(FEATURE_LABELS)
    expect(labelKeys.sort()).toEqual(limitKeys.sort())
  })

  it('all labels are non-empty strings', () => {
    for (const label of Object.values(FEATURE_LABELS)) {
      expect(typeof label).toBe('string')
      expect(label.length).toBeGreaterThan(0)
    }
  })
})
