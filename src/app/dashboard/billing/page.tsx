'use client'

import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Suspense, useState, useEffect, useCallback } from 'react'
import { LinkIcon, Webhook, Clock, AlertTriangle, Lock, CheckCircle2, ArrowDown, type LucideIcon } from 'lucide-react'
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
  type PlanConfig,
  type PricingTier,
  planConfigToTier,
} from '@/lib/pricing'

function UsageBar({ used, limit, label, icon: Icon }: { used: number; limit: number; label: string; icon: LucideIcon }) {
  const isUnlimited = limit === Infinity || limit >= 999999
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
  const sessionId = searchParams.get('session_id')
  const successPlan = searchParams.get('plan')
  const cardUpdated = searchParams.get('card_updated')
  const setupSessionId = searchParams.get('setup_session_id')
  const currentPlan = (session?.user?.plan as PlanTier) || 'FREE'
  const currentTier = getPlanByTier(currentPlan)
  const limits = getPlanLimits(currentPlan)
  const subscriptionStatus = session?.user?.subscriptionStatus
  const planExpiresAt = session?.user?.planExpiresAt
  const gracePeriodEndsAt = session?.user?.gracePeriodEndsAt

  const TIER_ORDER: PlanTier[] = ['FREE', 'PRO', 'TEAM']

  const [loadingPlan, setLoadingPlan] = useState<PlanTier | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [confirmPlan, setConfirmPlan] = useState<PlanTier | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [updateCardLoading, setUpdateCardLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'info'; text: string } | null>(null)

  // Fetch plans from API (DB-backed)
  const { data: plansData } = useQuery<PlanConfig[]>({
    queryKey: ['plans'],
    queryFn: async () => {
      const res = await fetch('/api/plans')
      if (!res.ok) return []
      return res.json()
    },
  })

  // Convert DB plans to PricingTier format for display, or fall back to hardcoded
  const displayTiers: PricingTier[] = plansData && plansData.length > 0
    ? plansData.map(planConfigToTier)
    : PRICING_TIERS

  // Handle checkout success — verify payment and activate plan
  const handleCheckoutSuccess = useCallback(async () => {
    if (!sessionId) return

    try {
      const res = await fetch('/api/billing/checkout/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const data = await res.json()
      if (data.success) {
        setStatusMessage({ type: 'success', text: `${successPlan || 'Plan'} activated! Your session will update shortly.` })
        updateSession()
        const retry1 = setTimeout(() => updateSession(), 3000)
        const retry2 = setTimeout(() => updateSession(), 8000)
        const clear = setTimeout(() => setStatusMessage(null), 10000)
        return () => { clearTimeout(retry1); clearTimeout(retry2); clearTimeout(clear) }
      } else {
        setStatusMessage({ type: 'info', text: data.error || 'Failed to activate plan. Please contact support.' })
      }
    } catch {
      setStatusMessage({ type: 'info', text: 'Something went wrong activating your plan. Please refresh.' })
    }
  }, [sessionId, successPlan, updateSession])

  // Show success/cancel feedback from Stripe redirect
  useEffect(() => {
    if (success === 'true' && sessionId) {
      handleCheckoutSuccess()
    } else if (cardUpdated === 'true' && setupSessionId) {
      // Handle card update callback
      fetch('/api/billing/update-payment-method/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: setupSessionId }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setStatusMessage({ type: 'success', text: 'Payment method updated successfully.' })
          } else {
            setStatusMessage({ type: 'info', text: data.error || 'Failed to update payment method.' })
          }
          setTimeout(() => setStatusMessage(null), 8000)
        })
        .catch(() => {
          setStatusMessage({ type: 'info', text: 'Something went wrong updating your payment method.' })
        })
    } else if (canceled === 'true') {
      setStatusMessage({ type: 'info', text: 'Checkout cancelled. No changes were made.' })
      const timer = setTimeout(() => setStatusMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [success, canceled, sessionId, handleCheckoutSuccess, cardUpdated, setupSessionId])

  // Auto-recover unprocessed checkout sessions (handles redirect failures)
  useEffect(() => {
    if (currentPlan !== 'FREE' || success === 'true') return
    let cancelled = false
    fetch('/api/billing/recover-checkout', { method: 'POST' })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data.recovered) {
          setStatusMessage({ type: 'success', text: data.message || `Your ${data.plan} plan has been activated.` })
          updateSession()
          setTimeout(() => updateSession(), 3000)
          setTimeout(() => setStatusMessage(null), 10000)
        }
      })
      .catch(() => {}) // Silent — this is a best-effort recovery
    return () => { cancelled = true }
  }, [currentPlan, success, updateSession])

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

  async function handlePlanSelect(plan: PlanTier) {
    if (plan === 'FREE') return

    // DOWNGRADING: user already has a scheduled plan switch
    if (subscriptionStatus === 'DOWNGRADING') {
      if (plan === currentPlan) {
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
          setStatusMessage({ type: 'success', text: data.message })
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

    // If already on a paid plan (upgrade), show confirmation with proration
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

  async function handleUpgrade(plan: PlanTier) {
    setConfirmPlan(null)
    setLoadingPlan(plan)
    try {
      const res = await fetch('/api/billing/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (data.success) {
        setStatusMessage({ type: 'success', text: data.message })
        updateSession()
        setTimeout(() => updateSession(), 3000)
        setTimeout(() => setStatusMessage(null), 10000)
      } else {
        setStatusMessage({ type: 'info', text: data.error || 'Failed to upgrade' })
      }
    } catch {
      setStatusMessage({ type: 'info', text: 'Something went wrong. Please try again.' })
    } finally {
      setLoadingPlan(null)
    }
  }

  async function handleCancelSubscription() {
    setConfirmCancel(false)
    setCancelLoading(true)
    try {
      const res = await fetch('/api/billing/cancel', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setStatusMessage({ type: 'success', text: data.message })
        updateSession()
        setTimeout(() => updateSession(), 3000)
        setTimeout(() => setStatusMessage(null), 10000)
      } else {
        setStatusMessage({ type: 'info', text: data.error || 'Failed to cancel subscription' })
      }
    } catch {
      setStatusMessage({ type: 'info', text: 'Something went wrong. Please try again.' })
    } finally {
      setCancelLoading(false)
    }
  }

  async function handleUpdatePaymentMethod() {
    setUpdateCardLoading(true)
    try {
      const res = await fetch('/api/billing/update-payment-method', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setStatusMessage({ type: 'info', text: data.error || 'Failed to start card update' })
        setUpdateCardLoading(false)
      }
    } catch {
      setStatusMessage({ type: 'info', text: 'Something went wrong. Please try again.' })
      setUpdateCardLoading(false)
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

      {/* Status Message */}
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
              {currentPlan !== 'FREE' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={updateCardLoading}
                  onClick={handleUpdatePaymentMethod}
                >
                  {updateCardLoading ? 'Redirecting...' : 'Update Payment Method'}
                </Button>
              )}
              {subscriptionStatus === 'ACTIVE' && currentPlan !== 'FREE' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={cancelLoading}
                  onClick={() => setConfirmCancel(true)}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  {cancelLoading ? 'Cancelling...' : 'Cancel Subscription'}
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
        {displayTiers.map((tier) => {
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
        Need help? <a href="/dashboard/support" className="text-ocean-600 hover:underline">Contact support</a>.
      </p>

      {/* Upgrade Confirmation Dialog (with proration) */}
      <Dialog open={confirmPlan !== null} onOpenChange={(open) => { if (!open) setConfirmPlan(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upgrade to {confirmPlan ? getPlanByTier(confirmPlan).name : ''}</DialogTitle>
            <DialogDescription>
              You&apos;re currently on the <strong>{currentTier.name}</strong> plan ({currentTier.priceLabel}{currentTier.priceSuffix}).
              Upgrading to <strong>{confirmPlan ? getPlanByTier(confirmPlan).name : ''}</strong> ({confirmPlan ? getPlanByTier(confirmPlan).priceLabel : ''}{confirmPlan ? getPlanByTier(confirmPlan).priceSuffix : ''}) will
              take effect immediately. You&apos;ll be charged the prorated difference for the remaining days in your billing cycle.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmPlan(null)}>
              Cancel
            </Button>
            <Button onClick={() => confirmPlan && handleUpgrade(confirmPlan)}>
              Confirm Upgrade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Subscription Confirmation Dialog */}
      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Subscription</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel your <strong>{currentTier.name}</strong> subscription?
              {planExpiresAt && (
                <> You&apos;ll keep access to all {currentPlan} features until <strong>{new Date(planExpiresAt).toLocaleDateString()}</strong>. After that, your account will revert to the Free plan.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmCancel(false)}>
              Keep Subscription
            </Button>
            <Button variant="destructive" onClick={handleCancelSubscription}>
              Cancel Subscription
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
