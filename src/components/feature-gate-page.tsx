'use client'

import Link from 'next/link'
import { Lock } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getPlanByTier, FEATURE_LABELS, planConfigToTier, type PlanTier, type PlanLimits, type PlanConfig } from '@/lib/pricing'

interface FeatureGatePageProps {
  feature: keyof PlanLimits
  requiredPlan: PlanTier
  title?: string
  description?: string
}

export function FeatureGatePage({ feature, requiredPlan, title, description }: FeatureGatePageProps) {
  const featureLabel = FEATURE_LABELS[feature]

  // Fetch plans from API to get dynamic pricing
  const { data: plansData } = useQuery<PlanConfig[]>({
    queryKey: ['plans'],
    queryFn: async () => {
      const res = await fetch('/api/plans')
      if (!res.ok) return []
      return res.json()
    },
  })

  const plan = (() => {
    if (plansData && plansData.length > 0) {
      const dbPlan = plansData.find((p) => p.tier === requiredPlan)
      if (dbPlan) return planConfigToTier(dbPlan)
    }
    return getPlanByTier(requiredPlan)
  })()

  return (
    <div className="max-w-lg mx-auto mt-16">
      <Card className="text-center">
        <CardContent className="pt-10 pb-8 px-8">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-ocean-100 flex items-center justify-center mb-6">
            <Lock className="h-8 w-8 text-ocean-600" />
          </div>
          <h2 className="text-2xl font-heading font-bold text-gray-900 mb-2">
            {title || `${featureLabel} is a ${plan.name} feature`}
          </h2>
          <p className="text-gray-600 mb-6">
            {description || `Upgrade to the ${plan.name} plan to unlock ${featureLabel.toLowerCase()} and more powerful features.`}
          </p>
          <div className="mb-6 inline-block">
            <span className="text-3xl font-heading font-bold">{plan.priceLabel}</span>
            <span className="text-gray-500">{plan.priceSuffix}</span>
          </div>
          <div className="space-y-3">
            <Link href={`/dashboard/billing?highlight=${requiredPlan}`}>
              <Button className="w-full">
                Upgrade to {plan.name}
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="ghost" className="w-full">
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
