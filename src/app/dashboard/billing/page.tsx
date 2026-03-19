'use client'

import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Suspense, useState, useEffect } from 'react'
import { LinkIcon, Webhook, Clock, AlertTriangle, Lock, CreditCard, CheckCircle2, ArrowDown, type LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
  const { data: session, update: updateSession } = useSession()
  const searchParams = useSearchParams()
  const highlightPlan = searchParams.get('highlight') as PlanTier | null
  const success = searchParams.get('success')
  const canceled = searchParams.get('canceled')
  const currentPlan = (session?.user?.plan as PlanTier) || 'FREE'
  const currentTier = getPlanByTier(currentPlan)
  const limits = getPlanLimits(currentPlan)
  const subscriptionStatus = session?.user?.subscriptionStatus
  const planExpiresAt = session?.user?.planExpiresAt
  const gracePeriodEndsAt = session?.user?.gracePeriodEndsAt
  const cleanupScheduledAt = session?.user?.cleanupScheduledAt

  const TIER_ORDER: PlanTier[] = ['FREE', 'PRO', 'TEAM']

  const [loadingPlan, setLoadingPlan] = useState<PlanTier | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [confirmPlan, setConfirmPlan] = useState<PlanTier | null>(null)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'info'; text: string } | null>(null)

  // Show success/cancel feedback from Stripe redirect
  useEffect(() => {
    if (success === 'true') {
      setStatusMessage({ type: 'success', text: 'Subscription activated! Your session will update shortly.' })
      // Refresh session — retry a few times since webhook may still be processing
      updateSession()
      const retry1 = setTimeout(() => updateSession(), 3000)
      const retry2 = setTimeout(() => updateSession(), 8000)
      // Clear message after 10 seconds
      const clear = setTimeout(() => setStatusMessage(null), 10000)
      return () => { clearTimeout(retry1); clearTimeout(retry2); clearTimeout(clear) }
    }
    if (canceled === 'true') {
      setStatusMessage({ type: 'info', text: 'Checkout cancelled. No changes were made.' })
      const timer = setTimeout(() => setStatusMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [success, canceled, updateSession])

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

  // Only show "Manage Subscription" when user has an active/unsubscribed Stripe subscription
  const hasPaidSubscription = (subscriptionStatus === 'ACTIVE' || subscriptionStatus === 'UNSUBSCRIBED') && currentPlan !== 'FREE'

  async function handlePlanSelect(plan: PlanTier) {
    if (plan === 'FREE') return

    // DOWNGRADING: user already has a scheduled plan switch
    if (subscriptionStatus === 'DOWNGRADING') {
      if (plan === currentPlan) {
        // Clicking current plan = cancel the downgrade and stay
        await handleCancelDowngrade()
        return
      }
      setStatusMessage({ type: 'info', text: 'Please cancel your scheduled plan switch first, then select a new plan.' })
      return
    }

    const isDowngrade = TIER_ORDER.indexOf(plan) < TIER_ORDER.indexOf(currentPlan)
    const canScheduleDowngrade = isDowngrade && subscriptionStatus === 'UNSUBSCRIBED'

    // Cancelled user switching to lower plan → schedule at period end
    if (canScheduleDowngrade) {
      setLoadingPlan(plan)
      try {
        const res = await fetch('/api/billing/schedule-downgrade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan }),
        })
        const data = await res.json()
        if (data.success) {
          setStatusMessage({ type: 'success', text: data.warning || data.message })
          updateSession()
          const retry = setTimeout(() => updateSession(), 3000)
          setTimeout(() => setStatusMessage(null), 8000)
          return () => clearTimeout(retry)
        } else {
          setStatusMessage({ type: 'info', text: data.error || 'Failed to schedule downgrade' })
        }
      } catch {
        setStatusMessage({ type: 'info', text: 'Something went wrong. Please try again.' })
      } finally {
        setLoadingPlan(null)
      }
      return
    }

    // If already on a paid plan (upgrade), show confirmation first
    const isUpgrade = subscriptionStatus === 'ACTIVE' && currentPlan !== 'FREE' && TIER_ORDER.indexOf(plan) > TIER_ORDER.indexOf(currentPlan)
    if (isUpgrade) {
      setConfirmPlan(plan)
      return
    }

    // Normal subscribe or re-subscribe → checkout
    await proceedToCheckout(plan)
  }

  async function proceedToCheckout(plan: PlanTier) {
    setConfirmPlan(null)
    setLoadingPlan(plan)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setStatusMessage({ type: 'info', text: data.error || 'Failed to start checkout' })
        setLoadingPlan(null)
      }
    } catch {
      setStatusMessage({ type: 'info', text: 'Something went wrong. Please try again.' })
      setLoadingPlan(null)
    }
  }

  async function handleCancelDowngrade() {
    setLoadingPlan(currentPlan)
    try {
      const res = await fetch('/api/billing/schedule-downgrade', { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        setStatusMessage({ type: 'success', text: 'Scheduled plan change cancelled.' })
        updateSession()
        setTimeout(() => updateSession(), 3000)
        setTimeout(() => setStatusMessage(null), 8000)
      } else {
        setStatusMessage({ type: 'info', text: data.error || 'Failed to cancel downgrade' })
      }
    } catch {
      setStatusMessage({ type: 'info', text: 'Something went wrong. Please try again.' })
    } finally {
      setLoadingPlan(null)
    }
  }

  async function handleManageSubscription() {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setStatusMessage({ type: 'info', text: data.error || 'Failed to open subscription portal' })
        setPortalLoading(false)
      }
    } catch {
      setStatusMessage({ type: 'info', text: 'Something went wrong. Please try again.' })
      setPortalLoading(false)
    }
  }

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

      {/* Status Message (success/cancel from Stripe redirect) */}
      {statusMessage && (
        <div className={cn(
          'mb-6 p-4 rounded-lg flex items-center gap-3',
          statusMessage.type === 'success' && 'bg-green-50 border border-green-200',
          statusMessage.type === 'info' && 'bg-blue-50 border border-blue-200',
        )}>
          {statusMessage.type === 'success' && <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />}
          <p className={cn(
            'text-sm',
            statusMessage.type === 'success' && 'text-green-700',
            statusMessage.type === 'info' && 'text-blue-700',
          )}>
            {statusMessage.text}
          </p>
        </div>
      )}

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
            <div className="flex items-center gap-3">
              {hasPaidSubscription && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={portalLoading}
                  onClick={handleManageSubscription}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  {portalLoading ? 'Opening...' : 'Manage Subscription'}
                </Button>
              )}
              <Badge className={getPlanBadgeStyles(currentPlan)}>
                {currentPlan}
              </Badge>
            </div>
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
                    Cancelled. {currentPlan} features remain active until <strong>{new Date(planExpiresAt).toLocaleDateString()}</strong>.
                  </p>
                )}
                {subscriptionStatus === 'GRACE_PERIOD' && gracePeriodEndsAt && (
                  <p className="text-sm text-orange-700">
                    Renew before <strong>{new Date(gracePeriodEndsAt).toLocaleDateString()}</strong> to keep your features.
                  </p>
                )}
                {subscriptionStatus === 'DOWNGRADING' && gracePeriodEndsAt && (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-orange-700">
                      Your plan will switch on <strong>{new Date(gracePeriodEndsAt).toLocaleDateString()}</strong>. Current features remain active until then.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loadingPlan !== null}
                      onClick={handleCancelDowngrade}
                      className="ml-4 flex-shrink-0"
                    >
                      {loadingPlan !== null ? 'Cancelling...' : 'Cancel Switch'}
                    </Button>
                  </div>
                )}
                {subscriptionStatus === 'LOCKED' && (
                  <p className="text-sm text-red-700">
                    Features locked. Upgrade to reactivate your event types and webhooks.
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
          {limits.maxWebhooks > 0 ? (
            <UsageBar used={webhookCount} limit={limits.maxWebhooks} label="Webhooks" icon={Webhook} />
          ) : (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-gray-400">
                <Webhook className="h-4 w-4" />
                Webhooks
              </div>
              <span className="text-gray-400 font-medium">Not included in plan</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pricing Grid */}
      <div className="grid md:grid-cols-3 gap-8">
        {PRICING_TIERS.map((tier) => {
          // Subscription is inactive or cancelled — allow subscribing to any paid plan
          // But FREE users with NONE status are on their correct plan, not "inactive"
          const subscriptionInactive = currentPlan !== 'FREE' && (!subscriptionStatus || ['NONE', 'UNSUBSCRIBED', 'GRACE_PERIOD', 'LOCKED', 'DOWNGRADING'].includes(subscriptionStatus))
          return (
            <PricingCard
              key={tier.id}
              tier={tier}
              currentPlan={currentPlan}
              highlighted={highlightPlan === tier.id}
              onSelect={tier.id !== 'FREE' ? handlePlanSelect : undefined}
              loading={loadingPlan === tier.id}
              disabled={loadingPlan !== null && loadingPlan !== tier.id}
              subscriptionInactive={subscriptionInactive}
            />
          )
        })}
      </div>

      <p className="text-center text-sm text-gray-400 mt-8">
        {hasPaidSubscription ? (
          <>
            Manage your subscription, update payment method, or view invoices via{' '}
            <button onClick={handleManageSubscription} className="text-ocean-600 hover:underline">
              the subscription portal
            </button>.
          </>
        ) : (
          <>
            Need help? <a href="/dashboard/support" className="text-ocean-600 hover:underline">Contact support</a>.
          </>
        )}
      </p>

      {/* Upgrade Confirmation Dialog */}
      <Dialog open={confirmPlan !== null} onOpenChange={(open) => { if (!open) setConfirmPlan(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upgrade to {confirmPlan ? getPlanByTier(confirmPlan).name : ''}</DialogTitle>
            <DialogDescription>
              You&apos;re currently on the <strong>{currentTier.name}</strong> plan ({currentTier.priceLabel}{currentTier.priceSuffix}).
              Upgrading to <strong>{confirmPlan ? getPlanByTier(confirmPlan).name : ''}</strong> ({confirmPlan ? getPlanByTier(confirmPlan).priceLabel : ''}{confirmPlan ? getPlanByTier(confirmPlan).priceSuffix : ''}) will
              take effect immediately. Stripe will prorate the difference.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmPlan(null)}>
              Cancel
            </Button>
            <Button onClick={() => confirmPlan && proceedToCheckout(confirmPlan)}>
              Confirm Upgrade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
