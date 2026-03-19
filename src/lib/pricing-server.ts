/**
 * Server-only pricing functions that require database access.
 *
 * Client-side code should import from '@/lib/pricing' instead.
 * These functions are cached in memory with a 5-minute TTL.
 */

import prisma from '@/lib/prisma'
import { type PlanTier, type PlanLimits, type PlanConfig, PLAN_LIMITS, planConfigToTier } from './pricing'

// Re-export types and the invalidate function for convenience
export { type PlanTier, type PlanLimits, type PlanConfig, invalidatePlanCache } from './pricing'

// ============================================================================
// In-memory cache
// ============================================================================

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
let planCache: Map<string, PlanConfig> | null = null
let cacheExpiry = 0

/** Invalidate the plan cache (call after admin updates a plan) */
export function invalidateServerPlanCache(): void {
  planCache = null
  cacheExpiry = 0
}

async function loadPlansIntoCache(): Promise<Map<string, PlanConfig>> {
  try {
    const dbPlans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    })

    const cache = new Map<string, PlanConfig>()
    for (const p of dbPlans) {
      const tier = p.tier as PlanTier
      const limits: PlanLimits = {
        maxEventTypes: p.maxEventTypes,
        maxWebhooks: p.maxWebhooks,
        customQuestions: p.customQuestions,
        groupBooking: p.groupBooking,
        recurringBooking: p.recurringBooking,
        teams: p.teams,
        analytics: p.analytics,
      }

      // Update the synchronous PLAN_LIMITS export in pricing.ts
      if (tier in PLAN_LIMITS) {
        PLAN_LIMITS[tier] = limits
      }

      cache.set(tier, {
        id: p.id,
        tier,
        name: p.name,
        price: p.price,
        currency: p.currency,
        intervalDays: p.intervalDays,
        isActive: p.isActive,
        sortOrder: p.sortOrder,
        description: p.description,
        highlightText: p.highlightText,
        priceLabel: p.priceLabel,
        priceSuffix: p.priceSuffix,
        features: Array.isArray(p.features) ? (p.features as string[]) : [],
        limits,
      })
    }

    planCache = cache
    cacheExpiry = Date.now() + CACHE_TTL_MS
    return cache
  } catch (error) {
    console.error('[pricing] Failed to load plans from DB, using fallback:', error)
    return new Map()
  }
}

function getCachedPlans(): Map<string, PlanConfig> | null {
  if (planCache && Date.now() < cacheExpiry) {
    return planCache
  }
  return null
}

// ============================================================================
// Async DB-backed functions (server-side only)
// ============================================================================

const FALLBACK_LIMITS: Record<PlanTier, PlanLimits> = {
  FREE: { maxEventTypes: 1, maxWebhooks: 0, customQuestions: false, groupBooking: false, recurringBooking: false, teams: false, analytics: false },
  PRO: { maxEventTypes: 999999, maxWebhooks: 10, customQuestions: true, groupBooking: true, recurringBooking: true, teams: false, analytics: false },
  TEAM: { maxEventTypes: 999999, maxWebhooks: 999999, customQuestions: true, groupBooking: true, recurringBooking: true, teams: true, analytics: true },
}

/** Get a single plan config from DB (cached). */
export async function getPlanConfig(tier: PlanTier): Promise<PlanConfig | null> {
  const cached = getCachedPlans()
  if (cached) return cached.get(tier) ?? null

  const plans = await loadPlansIntoCache()
  return plans.get(tier) ?? null
}

/** Get all active plans from DB (cached). */
export async function getAllPlans(): Promise<PlanConfig[]> {
  const cached = getCachedPlans()
  if (cached) return Array.from(cached.values())

  const plans = await loadPlansIntoCache()
  return Array.from(plans.values())
}

/** Get plan limits from DB (cached). Falls back to hardcoded if DB unavailable. */
export async function getPlanLimitsAsync(tier: PlanTier): Promise<PlanLimits> {
  const config = await getPlanConfig(tier)
  return config?.limits ?? FALLBACK_LIMITS[tier]
}

/** Get all plans converted to PricingTier display format. */
export async function getAllPricingTiers() {
  const plans = await getAllPlans()
  return plans.map(planConfigToTier)
}
