'use client'

import { useSession } from 'next-auth/react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Suspense, useState, useEffect, useRef } from 'react'
import { LinkIcon, Webhook } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PricingCard } from '@/components/billing/pricing-card'
import {
  PRICING_TIERS,
  TIER_ORDER,
  getPlanByTier,
  getPlanLimits,
  type PlanTier,
  type PlanConfig,
  type PricingTier,
  planConfigToTier,
} from '@/lib/pricing'
import UsageBar from '@/components/billing/usage-bar'
import CurrentPlanCard from '@/components/billing/current-plan-card'
import SubscriptionStatusCard from '@/components/billing/subscription-status-card'
import BillingDialogs from '@/components/billing/billing-dialogs'
import { cn } from '@/lib/utils'
import { CheckCircle2 } from 'lucide-react'

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

  const [loadingPlan, setLoadingPlan] = useState<PlanTier | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [reactivateLoading, setReactivateLoading] = useState(false)
  const [confirmPlan, setConfirmPlan] = useState<PlanTier | null>(null)
  const [confirmAction, setConfirmAction] = useState<'upgrade' | 'subscribe' | 'downgrade' | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [updateCardLoading, setUpdateCardLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'info'; text: string } | null>(null)

  const callbackProcessed = useRef(false)
  const recoveryProcessed = useRef(false)

  const { data: plansData } = useQuery<PlanConfig[]>({
    queryKey: ['plans'],
    queryFn: async () => {
      const res = await fetch('/api/plans')
      if (!res.ok) return []
      return res.json()
    },
  })

  const displayTiers: PricingTier[] = plansData && plansData.length > 0
    ? plansData.map(planConfigToTier)
    : PRICING_TIERS

  function getTierDisplay(tier: PlanTier): PricingTier {
    const dynamic = displayTiers.find((t) => t.id === tier)
    return dynamic || getPlanByTier(tier)
  }

  const currentTierDisplay = getTierDisplay(currentPlan)

  function cleanUrlParams() {
    router.replace('/dashboard/billing', { scroll: false })
  }

  // Handle checkout success
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

  // Auto-recover unprocessed checkout sessions
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
      .catch((err) => console.error('Failed to recover checkout session:', err))
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

    if (subscriptionStatus === 'DOWNGRADING') {
      if (plan === currentPlan) {
        await handleCancelDowngrade()
        return
      }
      setStatusMessage({ type: 'info', text: 'Please cancel your scheduled plan switch first, then select a new plan.' })
      return
    }

    if (subscriptionStatus === 'UNSUBSCRIBED' && plan === currentPlan) {
      await handleReactivateSubscription()
      return
    }

    const isDowngrade = TIER_ORDER.indexOf(plan) < TIER_ORDER.indexOf(currentPlan)
    const canScheduleDowngrade = isDowngrade && subscriptionStatus === 'UNSUBSCRIBED'

    if (canScheduleDowngrade) {
      setConfirmPlan(plan)
      setConfirmAction('downgrade')
      return
    }

    const isUpgrade = subscriptionStatus === 'ACTIVE' && currentPlan !== 'FREE' && TIER_ORDER.indexOf(plan) > TIER_ORDER.indexOf(currentPlan)
    if (isUpgrade) {
      setConfirmPlan(plan)
      setConfirmAction('upgrade')
      return
    }

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

      <CurrentPlanCard
        currentPlan={currentPlan}
        currentTierDisplay={currentTierDisplay}
        subscriptionStatus={subscriptionStatus}
        updateCardLoading={updateCardLoading}
        reactivateLoading={reactivateLoading}
        cancelLoading={cancelLoading}
        onUpdatePaymentMethod={handleUpdatePaymentMethod}
        onReactivate={handleReactivateSubscription}
        onCancelClick={() => setConfirmCancel(true)}
      />

      <SubscriptionStatusCard
        subscriptionStatus={subscriptionStatus ?? ''}
        currentPlan={currentPlan}
        planExpiresAt={planExpiresAt}
        gracePeriodEndsAt={gracePeriodEndsAt}
        loadingPlan={loadingPlan}
        onCancelDowngrade={handleCancelDowngrade}
      />

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

      <BillingDialogs
        confirmDialog={confirmDialog}
        onCloseConfirm={() => { setConfirmPlan(null); setConfirmAction(null) }}
        confirmCancel={confirmCancel}
        onCloseCancel={setConfirmCancel}
        currentTierDisplay={currentTierDisplay}
        planExpiresAt={planExpiresAt}
        currentPlan={currentPlan}
        onCancelSubscription={handleCancelSubscription}
      />
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
