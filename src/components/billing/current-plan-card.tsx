import { CreditCard, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getPlanBadgeStyles, type PlanTier, type PricingTier } from '@/lib/pricing'

interface CurrentPlanCardProps {
  currentPlan: PlanTier
  currentTierDisplay: PricingTier
  subscriptionStatus: string | undefined
  updateCardLoading: boolean
  reactivateLoading: boolean
  cancelLoading: boolean
  onUpdatePaymentMethod: () => void
  onReactivate: () => void
  onCancelClick: () => void
}

export default function CurrentPlanCard({
  currentPlan,
  currentTierDisplay,
  subscriptionStatus,
  updateCardLoading,
  reactivateLoading,
  cancelLoading,
  onUpdatePaymentMethod,
  onReactivate,
  onCancelClick,
}: CurrentPlanCardProps) {
  return (
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
                onClick={onUpdatePaymentMethod}
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
                onClick={onReactivate}
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
                onClick={onCancelClick}
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
  )
}
