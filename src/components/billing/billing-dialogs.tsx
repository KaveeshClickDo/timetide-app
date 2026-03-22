import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { PricingTier } from '@/lib/pricing'

interface ConfirmDialogContent {
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
}

interface BillingDialogsProps {
  confirmDialog: ConfirmDialogContent | null
  onCloseConfirm: () => void
  confirmCancel: boolean
  onCloseCancel: (open: boolean) => void
  currentTierDisplay: PricingTier
  planExpiresAt: number | undefined
  currentPlan: string
  onCancelSubscription: () => void
}

export default function BillingDialogs({
  confirmDialog,
  onCloseConfirm,
  confirmCancel,
  onCloseCancel,
  currentTierDisplay,
  planExpiresAt,
  currentPlan,
  onCancelSubscription,
}: BillingDialogsProps) {
  return (
    <>
      {/* Unified Confirmation Dialog (upgrade / subscribe / downgrade) */}
      <Dialog open={confirmDialog !== null} onOpenChange={(open) => { if (!open) onCloseConfirm() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog?.title}</DialogTitle>
            <DialogDescription>
              {confirmDialog?.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={onCloseConfirm}>
              Cancel
            </Button>
            <Button onClick={confirmDialog?.onConfirm}>
              {confirmDialog?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Subscription Confirmation Dialog */}
      <Dialog open={confirmCancel} onOpenChange={onCloseCancel}>
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
            <Button variant="outline" onClick={() => onCloseCancel(false)}>
              Keep Subscription
            </Button>
            <Button variant="destructive" onClick={onCancelSubscription}>
              Cancel Subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
