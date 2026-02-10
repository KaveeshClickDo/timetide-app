'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Zap, ArrowRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getUpgradeTier, type PlanTier } from '@/lib/pricing'

const DISMISS_KEY = 'timetide-upgrade-banner-dismissed'
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export function UpgradeBanner() {
  const { data: session } = useSession()
  const [dismissed, setDismissed] = useState(true) // Default to hidden to avoid flash

  const currentPlan = (session?.user?.plan as PlanTier) || 'FREE'
  const upgradeTier = getUpgradeTier(currentPlan)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const dismissedAt = localStorage.getItem(DISMISS_KEY)
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10)
      setDismissed(elapsed < DISMISS_DURATION_MS)
    } else {
      setDismissed(false)
    }
  }, [])

  // Don't show for TEAM users (highest tier) or if dismissed
  if (!upgradeTier || dismissed) return null

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString())
    setDismissed(true)
  }

  return (
    <Card className="mb-6 border-ocean-200 bg-gradient-to-r from-ocean-50 to-blue-50">
      <CardContent className="py-4 px-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-ocean-500 flex items-center justify-center flex-shrink-0">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-gray-900">
                Upgrade to {upgradeTier.name}
              </p>
              <p className="text-sm text-gray-600 truncate">
                {currentPlan === 'FREE'
                  ? 'Unlock unlimited event types, custom branding, and more'
                  : 'Add team scheduling, round robin, and analytics'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link href={`/dashboard/billing?highlight=${upgradeTier.id}`}>
              <Button size="sm">
                Upgrade
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
            <button
              onClick={handleDismiss}
              className="p-1 hover:bg-gray-200 rounded-md transition-colors"
              aria-label="Dismiss upgrade banner"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
