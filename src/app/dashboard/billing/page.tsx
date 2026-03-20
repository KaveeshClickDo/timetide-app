'use client'

import { useSession } from 'next-auth/react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Suspense, useState, useEffect, useRef } from 'react'
import { LinkIcon, Webhook, Clock, AlertTriangle, Lock, CheckCircle2, CreditCard, RefreshCw, type LucideIcon } from 'lucide-react'
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
  const router = useRouter()
  const highlightPlan = searchParams.get('highlight') as PlanTier | null
  const success = searchParams.get('success')
  const canceled = searchParams.get('canceled')
  const sessionId = searchParams.get('session_id')
  const successPlan = searchParams.get('plan')
  const cardUpdated = searchParams.get('card_updated')
  const setupSessionId = searchParams.get('setup_session_id')
  const currentPlan = (session?.user?.plan as PlanTier) || 'FREE'
  const limits = getPlanLimits(currentPlan)
  const subscriptionStatus = session?.user?.subscriptionStatus
  const planExpiresAt = session?.user?.planExpiresAt
  const gracePeriodEndsAt = session?.user?.gracePeriodEndsAt

  const TIER_ORDER: PlanTier[] = ['FREE', 'PRO', 'TEAM']

  const [loadingPlan, setLoadingPlan] = useState<PlanTier | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [reactivateLoading, setReactivateLoading] = useState(false)
  const [confirmPlan, setConfirmPlan] = useState<PlanTier | null>(null)
  const [confirmAction, setConfirmAction] = useState<'upgrade' | 'subscribe' | 'downgrade' | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [updateCardLoading, setUpdateCardLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'info'; text: string } | null>(null)

  // Prevent double-fire of checkout callback and recovery
  const callbackProcessed = useRef(false)
  const recoveryProcessed = useRef(false)

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

  // Helper to get dynamic tier info (from DB if available, fallback to hardcoded)
  function getTierDisplay(tier: PlanTier): PricingTier {
    const dynamic = displayTiers.find((t) => t.id === tier)
    return dynamic || getPlanByTier(tier)
  }

  // Current tier display (dynamic)
  const currentTierDisplay = getTierDisplay(currentPlan)

  // Clean URL params after processing (prevents re-fire on re-render)
  function cleanUrlParams() {
    router.replace('/dashboard/billing', { scroll: false })
  }

  // Handle checkout success — verify payment and activate plan
  useEffect(() => {
    if (success !== 'true' || !sessionId || callbackProcessed.current) return
    callbackProcessed.current = true

    async function processCallback() {
      try {
        const res = await fetch('/api/billing/checkout/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
        const data = await res.json()
        if (data.success) {
          setStatusMessage({ type: 'success', text: `${successPlan || 'Plan'} activated successfully!` })
          await updateSession()
          setTimeout(() => updateSession(), 3000)
          setTimeout(() => setStatusMessage(null), 10000)
        } else {
          setStatusMessage({ type: 'info', text: data.error || 'Failed to activate plan. Please contact support.' })
        }
      } catch {
        setStatusMessage({ type: 'info', text: 'Something went wrong activating your plan. Please refresh.' })
      }
      cleanUrlParams()
    }

    processCallback()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success, sessionId])

  // Handle card update callback
  useEffect(() => {
    if (cardUpdated !== 'true' || !setupSessionId || callbackProcessed.current) return
    callbackProcessed.current = true

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
      .finally(() => cleanUrlParams())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardUpdated, setupSessionId])

  // Handle checkout canceled
  useEffect(() => {
    if (canceled !== 'true') return
    setStatusMessage({ type: 'info', text: 'Checkout cancelled. No changes were made.' })
    const timer = setTimeout(() => setStatusMessage(null), 5000)
    cleanUrlParams()
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canceled])

  // Auto-recover unprocessed checkout sessions (handles redirect failures)
  useEffect(() => {
    if (currentPlan !== 'FREE' || success === 'true' || recoveryProcessed.current) return
    recoveryProcessed.current = true
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlan, success])

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

    // Cancelled user clicking same plan → reactivate (no charge, already paid until expiry)
    if (subscriptionStatus === 'UNSUBSCRIBED' && plan === currentPlan) {
      await handleReactivateSubscription()
      return
    }

    const isDowngrade = TIER_ORDER.indexOf(plan) < TIER_ORDER.indexOf(currentPlan)
    const canScheduleDowngrade = isDowngrade && subscriptionStatus === 'UNSUBSCRIBED'

    // Cancelled user switching to lower plan → show confirmation for schedule downgrade
    if (canScheduleDowngrade) {
      setConfirmPlan(plan)
      setConfirmAction('downgrade')
      return
    }

    // If already on a paid plan (upgrade), show confirmation with proration
    const isUpgrade = subscriptionStatus === 'ACTIVE' && currentPlan !== 'FREE' && TIER_ORDER.indexOf(plan) > TIER_ORDER.indexOf(currentPlan)
    if (isUpgrade) {
      setConfirmPlan(plan)
      setConfirmAction('upgrade')
      return
    }

    // Normal subscribe or re-subscribe → show confirmation
    setConfirmPlan(plan)
    setConfirmAction('subscribe')
  }

  async function proceedToCheckout(plan: PlanTier) {
    setConfirmPlan(null)
    setConfirmAction(null)
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
    setConfirmAction(null)
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

  async function handleScheduleDowngrade(plan: PlanTier) {
    setConfirmPlan(null)
    setConfirmAction(null)
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
        setTimeout(() => updateSession(), 3000)
        setTimeout(() => setStatusMessage(null), 8000)
      } else {
        setStatusMessage({ type: 'info', text: data.error || 'Failed to schedule downgrade' })
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

  async function handleReactivateSubscription() {
    setReactivateLoading(true)
    try {
      const res = await fetch('/api/billing/reactivate', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setStatusMessage({ type: 'success', text: data.message || 'Subscription reactivated!' })
        updateSession()
        setTimeout(() => updateSession(), 3000)
        setTimeout(() => setStatusMessage(null), 10000)
      } else {
        setStatusMessage({ type: 'info', text: data.error || 'Failed to reactivate subscription' })
      }
    } catch {
      setStatusMessage({ type: 'info', text: 'Something went wrong. Please try again.' })
    } finally {
      setReactivateLoading(false)
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

  // Get confirm dialog details based on action type
  function getConfirmDialogContent() {
    if (!confirmPlan || !confirmAction) return null
    const targetTier = getTierDisplay(confirmPlan)

    switch (confirmAction) {
      case 'upgrade':
        return {
          title: `Upgrade to ${targetTier.name}`,
          description: `You're currently on the ${currentTierDisplay.name} plan (${currentTierDisplay.priceLabel}${currentTierDisplay.priceSuffix}). Upgrading to ${targetTier.name} (${targetTier.priceLabel}${targetTier.priceSuffix}) will take effect immediately. You'll be charged the prorated difference for the remaining days in your billing cycle.`,
          confirmLabel: 'Confirm Upgrade',
          onConfirm: () => handleUpgrade(confirmPlan),
        }
      case 'subscribe':
        return {
          title: `Subscribe to ${targetTier.name}`,
          description: `You'll be redirected to checkout to subscribe to the ${targetTier.name} plan (${targetTier.priceLabel}${targetTier.priceSuffix}). Your card will be saved for automatic renewals.`,
          confirmLabel: 'Proceed to Checkout',
          onConfirm: () => proceedToCheckout(confirmPlan),
        }
      case 'downgrade':
        return {
          title: `Switch to ${targetTier.name}`,
          description: `Your plan will switch to ${targetTier.name} (${targetTier.priceLabel}${targetTier.priceSuffix}) at the end of your current billing period${planExpiresAt ? ` on ${new Date(planExpiresAt).toLocaleDateString()}` : ''}. You'll keep ${currentTierDisplay.name} features until then.`,
          confirmLabel: 'Schedule Switch',
          onConfirm: () => handleScheduleDowngrade(confirmPlan),
        }
      default:
        return null
    }
  }

  const confirmDialog = getConfirmDialogContent()

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-0">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500 mb-1">Current Plan</p>
              <p className="text-2xl font-heading font-bold text-gray-900">
                {currentTierDisplay.name}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {currentTierDisplay.priceLabel}{currentTierDisplay.priceSuffix}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {currentPlan !== 'FREE' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={updateCardLoading}
                  onClick={handleUpdatePaymentMethod}
                  className="text-xs sm:text-sm"
                >
                  <CreditCard className="h-3.5 w-3.5 mr-1.5 sm:mr-2" />
                  {updateCardLoading ? 'Redirecting...' : 'Update Card'}
                </Button>
              )}
              {subscriptionStatus === 'UNSUBSCRIBED' && currentPlan !== 'FREE' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={reactivateLoading}
                  onClick={handleReactivateSubscription}
                  className="text-xs sm:text-sm text-green-600 border-green-200 hover:bg-green-50"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5 sm:mr-2', reactivateLoading && 'animate-spin')} />
                  {reactivateLoading ? 'Reactivating...' : 'Reactivate'}
                </Button>
              )}
              {subscriptionStatus === 'ACTIVE' && currentPlan !== 'FREE' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={cancelLoading}
                  onClick={() => setConfirmCancel(true)}
                  className="text-xs sm:text-sm text-red-600 border-red-200 hover:bg-red-50"
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
            <div className="flex items-start gap-3 sm:gap-4">
              <div className={cn(
                'w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                subscriptionStatus === 'ACTIVE' && 'bg-green-100',
                subscriptionStatus === 'UNSUBSCRIBED' && 'bg-amber-100',
                (subscriptionStatus === 'GRACE_PERIOD' || subscriptionStatus === 'DOWNGRADING') && 'bg-orange-100',
                subscriptionStatus === 'LOCKED' && 'bg-red-100',
              )}>
                {subscriptionStatus === 'ACTIVE' && <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />}
                {subscriptionStatus === 'UNSUBSCRIBED' && <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />}
                {(subscriptionStatus === 'GRACE_PERIOD' || subscriptionStatus === 'DOWNGRADING') && <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600" />}
                {subscriptionStatus === 'LOCKED' && <Lock className="h-4 w-4 sm:h-5 sm:w-5 text-red-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Subscription Status</h3>
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
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
                    <p className="text-sm text-orange-700">
                      Your plan will switch on <strong>{new Date(gracePeriodEndsAt).toLocaleDateString()}</strong>. Current features remain active until then.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loadingPlan !== null}
                      onClick={handleCancelDowngrade}
                      className="flex-shrink-0 w-full sm:w-auto"
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
      <Card className="mb-6 sm:mb-8">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
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

      <p className="text-center text-sm text-gray-400 mt-6 sm:mt-8">
        Need help? <a href="/dashboard/support" className="text-ocean-600 hover:underline">Contact support</a>.
      </p>

      {/* Unified Confirmation Dialog (upgrade / subscribe / downgrade) */}
      <Dialog open={confirmDialog !== null} onOpenChange={(open) => { if (!open) { setConfirmPlan(null); setConfirmAction(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog?.title}</DialogTitle>
            <DialogDescription>
              {confirmDialog?.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setConfirmPlan(null); setConfirmAction(null) }}>
              Cancel
            </Button>
            <Button onClick={confirmDialog?.onConfirm}>
              {confirmDialog?.confirmLabel}
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
              Are you sure you want to cancel your <strong>{currentTierDisplay.name}</strong> subscription?
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
