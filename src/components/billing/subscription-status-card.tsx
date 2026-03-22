import { Clock, AlertTriangle, Lock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PlanTier } from '@/lib/pricing'

interface SubscriptionStatusCardProps {
  subscriptionStatus: string
  currentPlan: PlanTier
  planExpiresAt: number | undefined
  gracePeriodEndsAt: number | undefined
  loadingPlan: PlanTier | null
  onCancelDowngrade: () => void
}

export default function SubscriptionStatusCard({
  subscriptionStatus,
  currentPlan,
  planExpiresAt,
  gracePeriodEndsAt,
  loadingPlan,
  onCancelDowngrade,
}: SubscriptionStatusCardProps) {
  if (!subscriptionStatus || subscriptionStatus === 'NONE') return null

  return (
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
                  onClick={onCancelDowngrade}
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
  )
}
