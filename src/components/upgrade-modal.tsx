'use client'

import Link from 'next/link'
import { Zap, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getPlanByTier, FEATURE_LABELS, type PlanTier, type PlanLimits } from '@/lib/pricing'

interface UpgradeModalProps {
  feature: keyof PlanLimits
  requiredPlan: PlanTier
  open: boolean
  onClose: () => void
}

export function UpgradeModal({ feature, requiredPlan, open, onClose }: UpgradeModalProps) {
  const plan = getPlanByTier(requiredPlan)
  const featureLabel = FEATURE_LABELS[feature]

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-xl bg-ocean-100 flex items-center justify-center mb-2">
            <Zap className="h-6 w-6 text-ocean-600" />
          </div>
          <DialogTitle className="text-center">
            Upgrade to {plan.name}
          </DialogTitle>
          <DialogDescription className="text-center">
            <strong>{featureLabel}</strong> is available on the {plan.name} plan.
            Upgrade to unlock this feature and more.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="text-center mb-4">
            <span className="text-3xl font-heading font-bold">{plan.priceLabel}</span>
            <span className="text-gray-500">{plan.priceSuffix}</span>
          </div>
          <ul className="space-y-2">
            {plan.features.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-ocean-500 flex-shrink-0" />
                <span className="text-gray-600">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Link href={`/dashboard/billing?highlight=${requiredPlan}`} className="w-full">
            <Button className="w-full" onClick={onClose}>
              Upgrade to {plan.name}
            </Button>
          </Link>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            Maybe Later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
