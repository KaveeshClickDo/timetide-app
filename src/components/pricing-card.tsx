'use client'

import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PricingTier, PlanTier } from '@/lib/pricing'

const TIER_ORDER: PlanTier[] = ['FREE', 'PRO', 'TEAM']

interface PricingCardProps {
  tier: PricingTier
  currentPlan?: PlanTier
  highlighted?: boolean
  linkHref?: string
}

export function PricingCard({ tier, currentPlan, highlighted, linkHref }: PricingCardProps) {
  const isCurrentPlan = currentPlan === tier.id
  const isDowngrade =
    currentPlan && TIER_ORDER.indexOf(tier.id) < TIER_ORDER.indexOf(currentPlan)
  const showHighlight = highlighted || tier.isPopular

  return (
    <div
      className={cn(
        'card-ocean p-8 transition-shadow',
        showHighlight && 'border-2 border-ocean-500 relative shadow-lg',
        isCurrentPlan && !showHighlight && 'border-2 border-ocean-300 relative'
      )}
    >
      {tier.isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-ocean-500 text-white text-sm font-medium rounded-full">
          Popular
        </div>
      )}
      {isCurrentPlan && !tier.isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-ocean-600 text-white text-sm font-medium rounded-full">
          Current Plan
        </div>
      )}
      <h3 className="text-xl font-heading font-semibold text-gray-900 mb-2">
        {tier.name}
      </h3>
      <p className="text-gray-600 mb-6">{tier.description}</p>
      <div className="mb-6">
        <span className="text-4xl font-heading font-bold">{tier.priceLabel}</span>
        <span className="text-gray-500">{tier.priceSuffix}</span>
      </div>
      <ul className="space-y-3 mb-8">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-ocean-500 flex-shrink-0" />
            <span className="text-gray-600">{feature}</span>
          </li>
        ))}
      </ul>
      {isCurrentPlan ? (
        <Button variant="outline" className="w-full" disabled>
          Current Plan
        </Button>
      ) : isDowngrade ? (
        <Button variant="outline" className="w-full" disabled>
          {/* TODO: Implement downgrade flow when billing is integrated */}
          Downgrade
        </Button>
      ) : linkHref ? (
        <Link href={linkHref}>
          <Button variant={tier.ctaVariant} className="w-full">
            {currentPlan ? `Upgrade to ${tier.name}` : tier.ctaLabel}
          </Button>
        </Link>
      ) : (
        <Button variant={tier.ctaVariant} className="w-full">
          {currentPlan ? `Upgrade to ${tier.name}` : tier.ctaLabel}
        </Button>
      )}
    </div>
  )
}
