'use client'

import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Suspense } from 'react'
import { LinkIcon, Webhook, Clock, AlertTriangle, Lock, type LucideIcon } from 'lucide-react'
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

function UsageBar({ used, limit, label, icon: Icon }: { used: number; limit: number; label: string; icon: LucideIcon }) {
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
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const highlightPlan = searchParams.get('highlight') as PlanTier | null
  const currentPlan = (session?.user?.plan as PlanTier) || 'FREE'
  const currentTier = getPlanByTier(currentPlan)
  const limits = getPlanLimits(currentPlan)
  const subscriptionStatus = session?.user?.subscriptionStatus
  const planExpiresAt = session?.user?.planExpiresAt
  const gracePeriodEndsAt = session?.user?.gracePeriodEndsAt
  const cleanupScheduledAt = session?.user?.cleanupScheduledAt

  // Fetch usage counts
  const { data: eventTypes } = useQuery<{ eventTypes: unknown[] }>({
    queryKey: ['eventTypes'],
    queryFn: async () => {
      const res = await fetch('/api/event-types')
      if (!res.ok) return { eventTypes: [] }
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
  const webhookCount = (webhooks as any)?.webhooks?.length ?? 0

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-heading font-bold text-gray-900 mb-2">
          Billing & Plans
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
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

      {/* Subscription Status */}
      {subscriptionStatus && subscriptionStatus !== 'NONE' && (
        <Card className={cn(
          'mb-6',
          subscriptionStatus === 'ACTIVE' && 'border-green-200',
          subscriptionStatus === 'UNSUBSCRIBED' && 'border-amber-200',
          (subscriptionStatus === 'GRACE_PERIOD' || subscriptionStatus === 'DOWNGRADING') && 'border-orange-200',
          subscriptionStatus === 'LOCKED' && 'border-red-200',
        )}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                subscriptionStatus === 'ACTIVE' && 'bg-green-100',
                subscriptionStatus === 'UNSUBSCRIBED' && 'bg-amber-100',
                (subscriptionStatus === 'GRACE_PERIOD' || subscriptionStatus === 'DOWNGRADING') && 'bg-orange-100',
                subscriptionStatus === 'LOCKED' && 'bg-red-100',
              )}>
                {subscriptionStatus === 'ACTIVE' && <Clock className="h-5 w-5 text-green-600" />}
                {subscriptionStatus === 'UNSUBSCRIBED' && <Clock className="h-5 w-5 text-amber-600" />}
                {(subscriptionStatus === 'GRACE_PERIOD' || subscriptionStatus === 'DOWNGRADING') && <AlertTriangle className="h-5 w-5 text-orange-600" />}
                {subscriptionStatus === 'LOCKED' && <Lock className="h-5 w-5 text-red-600" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900">Subscription Status</h3>
                  <Badge variant="outline" className={cn(
                    'text-xs',
                    subscriptionStatus === 'ACTIVE' && 'border-green-300 text-green-700',
                    subscriptionStatus === 'UNSUBSCRIBED' && 'border-amber-300 text-amber-700',
                    (subscriptionStatus === 'GRACE_PERIOD' || subscriptionStatus === 'DOWNGRADING') && 'border-orange-300 text-orange-700',
                    subscriptionStatus === 'LOCKED' && 'border-red-300 text-red-700',
                  )}>
                    {subscriptionStatus === 'ACTIVE' && 'Active'}
                    {subscriptionStatus === 'UNSUBSCRIBED' && 'Cancelled'}
                    {subscriptionStatus === 'GRACE_PERIOD' && 'Grace Period'}
                    {subscriptionStatus === 'DOWNGRADING' && 'Downgrading'}
                    {subscriptionStatus === 'LOCKED' && 'Locked'}
                  </Badge>
                </div>
                {subscriptionStatus === 'ACTIVE' && planExpiresAt && (
                  <p className="text-sm text-gray-600">
                    Your plan renews on <strong>{new Date(planExpiresAt).toLocaleDateString()}</strong>.
                  </p>
                )}
                {subscriptionStatus === 'UNSUBSCRIBED' && planExpiresAt && (
                  <p className="text-sm text-amber-700">
                    Cancelled. PRO features remain active until <strong>{new Date(planExpiresAt).toLocaleDateString()}</strong>.
                  </p>
                )}
                {(subscriptionStatus === 'GRACE_PERIOD' || subscriptionStatus === 'DOWNGRADING') && gracePeriodEndsAt && (
                  <p className="text-sm text-orange-700">
                    Renew before <strong>{new Date(gracePeriodEndsAt).toLocaleDateString()}</strong> to keep your features.
                  </p>
                )}
                {subscriptionStatus === 'LOCKED' && cleanupScheduledAt && (
                  <p className="text-sm text-red-700">
                    Features locked. Data will be permanently deleted on <strong>{new Date(cleanupScheduledAt).toLocaleDateString()}</strong>.
                    Reactivate now to restore them.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Usage Indicators */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Current Usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <UsageBar used={eventTypeCount} limit={limits.maxEventTypes} label="Event Types" icon={LinkIcon} />
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

      <p className="text-center text-sm text-gray-400 mt-8">
        Need to change your plan? <a href="/dashboard/support" className="text-ocean-600 hover:underline">Contact support</a>.
      </p>
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
