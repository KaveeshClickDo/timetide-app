/**
 * Shared pricing tier configuration for TimeTide
 * Used by: landing page, billing page, upgrade components
 */

export type PlanTier = 'FREE' | 'PRO' | 'TEAM'

export interface PricingTier {
  id: PlanTier
  name: string
  description: string
  price: number
  priceLabel: string
  priceSuffix: string
  isPopular: boolean
  features: string[]
  ctaLabel: string
  ctaVariant: 'outline' | 'default'
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'FREE',
    name: 'Free',
    description: 'Perfect for individuals',
    price: 0,
    priceLabel: '$0',
    priceSuffix: '/month',
    isPopular: false,
    features: [
      '1 Event Type',
      'Unlimited Bookings',
      'Calendar Integration',
      'Email Notifications',
    ],
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
    features: [
      'Unlimited Event Types',
      'Custom Branding',
      'Multiple Calendars',
      'Buffer Times',
      'Custom Questions',
      'Priority Support',
    ],
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
    features: [
      'Everything in Pro',
      'Team Scheduling',
      'Round Robin',
      'Collective Events',
      'Analytics',
      'API Access',
    ],
    ctaLabel: 'Contact Sales',
    ctaVariant: 'outline',
  },
]

export function getPlanByTier(tier: PlanTier): PricingTier {
  return PRICING_TIERS.find((t) => t.id === tier) ?? PRICING_TIERS[0]
}

export function getUpgradeTier(currentTier: PlanTier): PricingTier | null {
  const tierOrder: PlanTier[] = ['FREE', 'PRO', 'TEAM']
  const currentIndex = tierOrder.indexOf(currentTier)
  if (currentIndex < tierOrder.length - 1) {
    return getPlanByTier(tierOrder[currentIndex + 1])
  }
  return null
}

// ============================================================================
// PLAN LIMITS — Feature gating configuration
// ============================================================================

export interface PlanLimits {
  maxEventTypes: number
  maxCalendars: number
  maxWebhooks: number
  bufferTimes: boolean
  customQuestions: boolean
  groupBooking: boolean
  bookingLimits: boolean
  teams: boolean
  analytics: boolean
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  FREE: {
    // TODO: Restore original FREE limits when enabling paid tiers
    maxEventTypes: Infinity,
    maxCalendars: Infinity,
    maxWebhooks: Infinity,
    bufferTimes: true,
    customQuestions: true,
    groupBooking: true,
    bookingLimits: true,
    teams: true,
    analytics: true,
  },
  PRO: {
    maxEventTypes: Infinity,
    maxCalendars: Infinity,
    maxWebhooks: Infinity,
    bufferTimes: true,
    customQuestions: true,
    groupBooking: true,
    bookingLimits: true,
    teams: true,
    analytics: true,
  },
  TEAM: {
    maxEventTypes: Infinity,
    maxCalendars: Infinity,
    maxWebhooks: Infinity,
    bufferTimes: true,
    customQuestions: true,
    groupBooking: true,
    bookingLimits: true,
    teams: true,
    analytics: true,
  },
}

export function getPlanLimits(plan: PlanTier): PlanLimits {
  return PLAN_LIMITS[plan]
}

/** Returns the minimum plan tier required to access a boolean feature */
export function getRequiredPlan(feature: keyof PlanLimits): PlanTier {
  if (PLAN_LIMITS.FREE[feature]) return 'FREE'
  if (PLAN_LIMITS.PRO[feature]) return 'PRO'
  return 'TEAM'
}

/** Human-readable labels for plan limit features */
export const FEATURE_LABELS: Record<keyof PlanLimits, string> = {
  maxEventTypes: 'Event Types',
  maxCalendars: 'Calendar Integrations',
  maxWebhooks: 'Webhooks',
  bufferTimes: 'Buffer Times',
  customQuestions: 'Custom Questions',
  groupBooking: 'Group Booking',
  bookingLimits: 'Booking Limits',
  teams: 'Team Scheduling',
  analytics: 'Analytics',
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
