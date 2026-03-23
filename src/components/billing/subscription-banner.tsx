'use client'

import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { AlertTriangle, Clock, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function SubscriptionBanner() {
  const { data: session } = useSession()
  const status = session?.user?.subscriptionStatus
  const plan = session?.user?.plan || 'PRO'
  const planExpiresAt = session?.user?.planExpiresAt
  const gracePeriodEndsAt = session?.user?.gracePeriodEndsAt
  const cleanupScheduledAt = session?.user?.cleanupScheduledAt

  if (!status || status === 'NONE' || status === 'ACTIVE') return null

  const now = Date.now()

  const getDaysLeft = (timestamp?: number) => {
    if (!timestamp) return 0
    return Math.max(0, Math.ceil((timestamp - now) / (24 * 60 * 60 * 1000)))
  }

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'N/A'
    return new Date(timestamp).toLocaleDateString()
  }

  let variant: 'warning' | 'danger' | 'critical' = 'warning'
  let icon = Clock
  let title = ''
  let message = ''
  let ctaLabel = ''

  switch (status) {
    case 'UNSUBSCRIBED': {
      variant = 'warning'
      icon = Clock
      title = 'Subscription cancelled'
      const days = getDaysLeft(planExpiresAt)
      message = `Your ${plan} features remain active until ${formatDate(planExpiresAt)} (${days} day${days !== 1 ? 's' : ''} left).`
      ctaLabel = 'Reactivate'
      break
    }
    case 'GRACE_PERIOD': {
      variant = 'danger'
      icon = AlertTriangle
      title = 'Billing period ended'
      const days = getDaysLeft(gracePeriodEndsAt)
      message = `You have ${days} day${days !== 1 ? 's' : ''} to renew before your features are locked (${formatDate(gracePeriodEndsAt)}).`
      ctaLabel = 'Renew Now'
      break
    }
    case 'DOWNGRADING': {
      variant = 'warning'
      icon = Clock
      title = 'Plan switch scheduled'
      const days = getDaysLeft(gracePeriodEndsAt)
      message = `Your ${plan} features remain active for ${days} more day${days !== 1 ? 's' : ''} (until ${formatDate(gracePeriodEndsAt)}).`
      ctaLabel = 'View Billing'
      break
    }
    case 'LOCKED': {
      variant = 'critical'
      icon = Lock
      title = 'Features locked'
      message = 'Your locked event types and webhooks are inactive. Upgrade to reactivate them.'
      ctaLabel = 'Upgrade Now'
      break
    }
    default:
      return null
  }

  const Icon = icon

  return (
    <div
      className={cn(
        'px-4 py-3 flex items-center gap-3 text-sm',
        variant === 'warning' && 'bg-amber-50 border-b border-amber-200 text-amber-800',
        variant === 'danger' && 'bg-orange-50 border-b border-orange-200 text-orange-800',
        variant === 'critical' && 'bg-red-50 border-b border-red-200 text-red-800',
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-semibold">{title}:</span>{' '}
        <span>{message}</span>
      </div>
      <Link href="/dashboard/billing">
        <Button
          size="sm"
          variant={variant === 'critical' ? 'destructive' : 'default'}
          className="flex-shrink-0"
        >
          {ctaLabel}
        </Button>
      </Link>
    </div>
  )
}
