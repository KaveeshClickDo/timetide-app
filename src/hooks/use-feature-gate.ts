'use client'

import { useSession } from 'next-auth/react'
import {
  getPlanLimits,
  getRequiredPlan,
  type PlanTier,
  type PlanLimits,
} from '@/lib/pricing'

type BooleanFeature = {
  [K in keyof PlanLimits]: PlanLimits[K] extends boolean ? K : never
}[keyof PlanLimits]

type NumericFeature = {
  [K in keyof PlanLimits]: PlanLimits[K] extends number ? K : never
}[keyof PlanLimits]

interface FeatureGateResult {
  /** Whether the user can access this feature */
  canAccess: boolean
  /** Whether the user needs to upgrade to access this feature */
  requiresUpgrade: boolean
  /** The minimum plan required to access this feature */
  requiredPlan: PlanTier
  /** The user's current plan */
  currentPlan: PlanTier
}

interface NumericGateResult extends FeatureGateResult {
  /** The plan's limit for this feature */
  limit: number
  /** Formatted limit string (e.g., "1", "5", "Unlimited") */
  limitLabel: string
}

/** Check access for a boolean feature (e.g., bufferTimes, customQuestions) */
export function useFeatureGate(feature: BooleanFeature): FeatureGateResult

/** Check access for a numeric/count feature (e.g., maxEventTypes) with current usage count */
export function useFeatureGate(feature: NumericFeature, currentCount?: number): NumericGateResult

export function useFeatureGate(
  feature: keyof PlanLimits,
  currentCount?: number
): FeatureGateResult | NumericGateResult {
  const { data: session } = useSession()
  const currentPlan = (session?.user?.plan as PlanTier) || 'FREE'
  const limits = getPlanLimits(currentPlan)
  const requiredPlan = getRequiredPlan(feature)
  const value = limits[feature]

  if (typeof value === 'boolean') {
    return {
      canAccess: value,
      requiresUpgrade: !value,
      requiredPlan,
      currentPlan,
    }
  }

  // Numeric feature
  const limit = value as number
  const canAccess = currentCount === undefined ? limit > 0 : currentCount < limit

  return {
    canAccess,
    requiresUpgrade: !canAccess,
    requiredPlan: canAccess ? currentPlan : requiredPlan,
    currentPlan,
    limit,
    limitLabel: limit === Infinity ? 'Unlimited' : String(limit),
  }
}
