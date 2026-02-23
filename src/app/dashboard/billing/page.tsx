'use client'

import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Suspense } from 'react'
import { LinkIcon, Webhook, Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PricingCard } from '@/components/pricing-card'
import { cn } from '@/lib/utils'
import {
  PRICING_TIERS,
  getPlanByTier,
  getPlanBadgeStyles,
  getPlanLimits,
  type PlanTier,
} from '@/lib/pricing'

function UsageBar({ used, limit, label, icon: Icon }: { used: number; limit: number; label: string; icon: typeof Calendar }) {
  const isUnlimited = limit === Infinity
  const percentage = isUnlimited ? 0 : Math.min((used / limit) * 100, 100)
  const isAtLimit = !isUnlimited && used >= limit

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-gray-700">
          <Icon className="h-4 w-4" />
          {label}
        </div>
        <span className={cn('font-medium', isAtLimit ? 'text-amber-600' : 'text-gray-900')}>
          {used} / {isUnlimited ? 'Unlimited' : limit}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              isAtLimit ? 'bg-amber-500' : 'bg-ocean-500'
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  )
}

function BillingContent() {
  const { data: session, update: updateSession } = useSession()
  const searchParams = useSearchParams()
  const highlightPlan = searchParams.get('highlight') as PlanTier | null
  const currentPlan = (session?.user?.plan as PlanTier) || 'FREE'
  const currentTier = getPlanByTier(currentPlan)
  const limits = getPlanLimits(currentPlan)

  // Fetch usage counts
  const { data: eventTypes } = useQuery<{ eventTypes: unknown[] }>({
    queryKey: ['eventTypes'],
    queryFn: async () => {
      const res = await fetch('/api/event-types')
      if (!res.ok) return { eventTypes: [] }
      return res.json()
    },
  })

  const { data: calendars } = useQuery<{ calendars: unknown[] }>({
    queryKey: ['calendars'],
    queryFn: async () => {
      const res = await fetch('/api/calendars')
      if (!res.ok) return { calendars: [] }
      return res.json()
    },
  })

  const { data: webhooks } = useQuery<{ webhooks: unknown[] }>({
    queryKey: ['webhooks'],
    queryFn: async () => {
      const res = await fetch('/api/webhooks')
      if (!res.ok) return { webhooks: [] }
      return res.json()
    },
  })

  const eventTypeCount = (eventTypes as any)?.eventTypes?.length ?? 0
  const calendarCount = (calendars as any)?.calendars?.length ?? 0
  const webhookCount = (webhooks as any)?.webhooks?.length ?? 0

  // Demo mode plan switching (development only)
  const handlePlanSwitch = async (plan: PlanTier) => {
    try {
      const res = await fetch('/api/mock/switch-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      if (res.ok) {
        await updateSession({ ...session, user: { ...session?.user, plan } })
        window.location.reload()
      }
    } catch {
      // Mock API may not exist yet
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-heading font-bold text-gray-900 mb-2">
          Billing & Plans
        </h1>
        <p className="text-gray-600">
          Manage your subscription and view available plans.
        </p>
      </div>

      {/* Current Plan Summary */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Current Plan</p>
              <p className="text-2xl font-heading font-bold text-gray-900">
                {currentTier.name}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {currentTier.priceLabel}{currentTier.priceSuffix}
              </p>
            </div>
            <Badge className={getPlanBadgeStyles(currentPlan)}>
              {currentPlan}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Usage Indicators */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Current Usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <UsageBar used={eventTypeCount} limit={limits.maxEventTypes} label="Event Types" icon={LinkIcon} />
          <UsageBar used={calendarCount} limit={limits.maxCalendars} label="Calendars" icon={Calendar} />
          <UsageBar used={webhookCount} limit={limits.maxWebhooks} label="Webhooks" icon={Webhook} />
        </CardContent>
      </Card>

      {/* Pricing Grid */}
      <div className="grid md:grid-cols-3 gap-8">
        {PRICING_TIERS.map((tier) => (
          <PricingCard
            key={tier.id}
            tier={tier}
            currentPlan={currentPlan}
            highlighted={highlightPlan === tier.id}
            linkHref="#" // TODO: Link to Stripe checkout when payment integration is added
          />
        ))}
      </div>

      {/* TODO: Add billing history, payment method management when Stripe is integrated */}
      <p className="text-center text-sm text-gray-400 mt-8">
        Payment integration coming soon. Contact support for plan changes.
      </p>

      {/* Demo Mode - Development Only */}
      {process.env.NODE_ENV === 'development' && (
        <Card className="mt-8 border-dashed border-2 border-amber-300">
          <CardHeader>
            <CardTitle className="text-base text-amber-700">
              Demo Mode — Switch Plan (Dev Only)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              {(['FREE', 'PRO', 'TEAM'] as PlanTier[]).map((plan) => (
                <button
                  key={plan}
                  onClick={() => handlePlanSwitch(plan)}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                    currentPlan === plan
                      ? 'bg-ocean-500 text-white border-ocean-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  )}
                >
                  Switch to {plan}
                </button>
              ))}
            </div>
            <p className="text-xs text-amber-600 mt-2">
              This section is only visible in development mode.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function BillingPage() {
  return (
    <Suspense>
      <BillingContent />
    </Suspense>
  )
}
