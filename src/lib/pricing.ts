/**
 * Pricing & plan configuration for TimeTide.
 *
 * This file contains ONLY client-safe synchronous helpers.
 * For async DB-backed functions (getPlanConfig, getAllPlans, getPlanLimitsAsync),
 * import from '@/server/billing/pricing-server' instead (server-only).
 *
 * For client-side usage, plan limits are included in the session JWT
 * (see auth.ts) so components can check access synchronously.
 */

// ============================================================================
// Types
// ============================================================================

export type PlanTier = 'FREE' | 'PRO' | 'TEAM'

/** Canonical tier ordering — import this instead of defining locally */
export const TIER_ORDER: PlanTier[] = ['FREE', 'PRO', 'TEAM']

/** Paid plan tiers — import this instead of inline ['PRO', 'TEAM'] checks */
export const PAID_PLANS: PlanTier[] = ['PRO', 'TEAM']

export interface PlanLimits {
  maxEventTypes: number
  maxWebhooks: number
  customQuestions: boolean
  groupBooking: boolean
  recurringBooking: boolean
  teams: boolean
  analytics: boolean
}

export interface PlanConfig {
  id: string
  tier: PlanTier
  name: string
  price: number       // cents
  currency: string
  intervalDays: number
  isActive: boolean
  sortOrder: number
  description: string | null
  highlightText: string | null
  priceLabel: string | null
  priceSuffix: string | null
  features: string[]
  limits: PlanLimits
}

/** Shape used by PricingCard and legacy display components */
export interface PricingTier {
  id: PlanTier
  name: string
  description: string
  price: number        // dollars (for display)
  priceLabel: string
  priceSuffix: string
  isPopular: boolean
  features: string[]
  ctaLabel: string
  ctaVariant: 'outline' | 'default'
}

// ============================================================================
// Hardcoded fallback — used when DB is unavailable (build time, tests, etc.)
// ============================================================================

const FALLBACK_LIMITS: Record<PlanTier, PlanLimits> = {
  FREE: {
    maxEventTypes: 1,
    maxWebhooks: 0,
    customQuestions: false,
    groupBooking: false,
    recurringBooking: false,
    teams: false,
    analytics: false,
  },
  PRO: {
    maxEventTypes: 999999,
    maxWebhooks: 10,
    customQuestions: true,
    groupBooking: true,
    recurringBooking: true,
    teams: false,
    analytics: false,
  },
  TEAM: {
    maxEventTypes: 999999,
    maxWebhooks: 999999,
    customQuestions: true,
    groupBooking: true,
    recurringBooking: true,
    teams: true,
    analytics: true,
  },
}

// Keep PLAN_LIMITS as a mutable record that gets updated from DB cache
// (pricing-server.ts updates this when it loads plans from DB)
export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = { ...FALLBACK_LIMITS }

// ============================================================================
// Cache invalidation (shared flag for pricing-server.ts)
// ============================================================================

/** Invalidate the plan cache (call after admin updates a plan) */
export function invalidatePlanCache(): void {
  // This is a no-op on the client side.
  // On the server, pricing-server.ts also calls invalidateServerPlanCache().
  // The main purpose is to allow admin API routes to import from pricing.ts
  // without needing to import from pricing-server.ts.
}

// ============================================================================
// Synchronous helpers (use cached data or hardcoded fallback)
// These are safe for client-side and build-time usage.
// ============================================================================

/** Synchronous plan limits — reads from cache if available, otherwise fallback. */
export function getPlanLimits(plan: PlanTier): PlanLimits {
  return PLAN_LIMITS[plan]
}

/** Returns the minimum plan tier required to access a boolean feature */
export function getRequiredPlan(feature: keyof PlanLimits): PlanTier {
  if (PLAN_LIMITS.FREE[feature]) return 'FREE'
  if (PLAN_LIMITS.PRO[feature]) return 'PRO'
  return 'TEAM'
}

export function getPlanBadgeStyles(plan: PlanTier): string {
  switch (plan) {
    case 'PRO':
      return 'bg-ocean-100 text-ocean-700 hover:bg-ocean-100'
    case 'TEAM':
      return 'bg-purple-100 text-purple-700 hover:bg-purple-100'
    default:
      return 'bg-gray-100 text-gray-600 hover:bg-gray-100'
  }
}

/** Convert PlanConfig to the legacy PricingTier shape for display components */
export function planConfigToTier(config: PlanConfig): PricingTier {
  const index = TIER_ORDER.indexOf(config.tier)
  return {
    id: config.tier,
    name: config.name,
    description: config.description || '',
    price: config.price / 100,
    priceLabel: config.priceLabel || (config.price === 0 ? 'Free' : `$${config.price / 100}`),
    priceSuffix: config.priceSuffix || (config.price === 0 ? '' : '/month'),
    isPopular: config.highlightText !== null,
    features: config.features,
    ctaLabel: config.price === 0 ? 'Get Started' : (index === 1 ? 'Upgrade to Pro' : 'Upgrade to Team'),
    ctaVariant: index === 1 ? 'default' : 'outline',
  }
}

/** Get PricingTier by tier name (sync, from fallback) */
export function getPlanByTier(tier: PlanTier): PricingTier {
  const fallbackNames: Record<PlanTier, string> = { FREE: 'Free', PRO: 'Pro', TEAM: 'Team' }
  return {
    id: tier,
    name: fallbackNames[tier],
    description: '',
    price: tier === 'FREE' ? 0 : tier === 'PRO' ? 12 : 20,
    priceLabel: tier === 'FREE' ? 'Free' : tier === 'PRO' ? '$12' : '$20',
    priceSuffix: tier === 'FREE' ? '' : '/month',
    isPopular: tier === 'PRO',
    features: [],
    ctaLabel: tier === 'FREE' ? 'Get Started' : `Upgrade to ${fallbackNames[tier]}`,
    ctaVariant: tier === 'PRO' ? 'default' : 'outline',
  }
}

export function getUpgradeTier(currentTier: PlanTier): PricingTier | null {
  const currentIndex = TIER_ORDER.indexOf(currentTier)
  if (currentIndex < TIER_ORDER.length - 1) {
    return getPlanByTier(TIER_ORDER[currentIndex + 1])
  }
  return null
}

/** Human-readable labels for plan limit features */
export const FEATURE_LABELS: Record<keyof PlanLimits, string> = {
  maxEventTypes: 'Event Types',
  maxWebhooks: 'Webhooks',
  customQuestions: 'Custom Questions',
  groupBooking: 'Group Booking',
  recurringBooking: 'Recurring Bookings',
  teams: 'Team Scheduling',
  analytics: 'Analytics',
}

// ============================================================================
// Legacy compat — PRICING_TIERS as a static fallback
// ============================================================================

const FALLBACK_TIERS: PricingTier[] = [
  {
    id: 'FREE',
    name: 'Free',
    description: 'Perfect for individuals',
    price: 0,
    priceLabel: '$0',
    priceSuffix: '/month',
    isPopular: false,
    features: ['1 Event Type', 'Unlimited Bookings', 'Google & Outlook Calendar', 'Buffer Times & Booking Limits', 'Email Notifications'],
    ctaLabel: 'Get Started',
    ctaVariant: 'outline',
  },
  {
    id: 'PRO',
    name: 'Pro',
    description: 'For growing professionals',
    price: 12,
    priceLabel: '$12',
    priceSuffix: '/month',
    isPopular: true,
    features: ['Unlimited Event Types', 'Custom Questions', 'Group Booking', 'Recurring Bookings', 'Up to 10 Webhooks', 'Priority Support'],
    ctaLabel: 'Start Free Trial',
    ctaVariant: 'default',
  },
  {
    id: 'TEAM',
    name: 'Team',
    description: 'For teams and businesses',
    price: 20,
    priceLabel: '$20',
    priceSuffix: '/user/month',
    isPopular: false,
    features: ['Everything in Pro', 'Team Scheduling', 'Round Robin & Collective Events', 'Analytics Dashboard', 'Unlimited Webhooks', 'API Access'],
    ctaLabel: 'Contact Sales',
    ctaVariant: 'outline',
  },
]

/** Synchronous pricing tiers for display (uses cached DB data if available) */
export const PRICING_TIERS: PricingTier[] = FALLBACK_TIERS
