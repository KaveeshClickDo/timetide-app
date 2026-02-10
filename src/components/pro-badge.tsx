'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getRequiredPlan, getPlanByTier, type PlanTier, type PlanLimits } from '@/lib/pricing'
import { UpgradeModal } from '@/components/upgrade-modal'

interface ProBadgeProps {
  feature: keyof PlanLimits
  className?: string
}

export function ProBadge({ feature, className }: ProBadgeProps) {
  const { data: session } = useSession()
  const [showModal, setShowModal] = useState(false)

  const currentPlan = (session?.user?.plan as PlanTier) || 'FREE'
  const requiredPlan = getRequiredPlan(feature)
  const planName = getPlanByTier(requiredPlan).name.toUpperCase()

  // Don't show badge if user already has access
  const tierOrder: PlanTier[] = ['FREE', 'PRO', 'TEAM']
  if (tierOrder.indexOf(currentPlan) >= tierOrder.indexOf(requiredPlan)) {
    return null
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setShowModal(true)
        }}
        className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors',
          requiredPlan === 'TEAM'
            ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
            : 'bg-ocean-100 text-ocean-700 hover:bg-ocean-200',
          className
        )}
      >
        <Lock className="h-2.5 w-2.5" />
        {planName}
      </button>
      <UpgradeModal
        feature={feature}
        requiredPlan={requiredPlan}
        open={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  )
}
