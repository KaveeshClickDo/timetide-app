/**
 * Stripe sync for admin plan actions.
 *
 * When an admin changes a user's plan, this module syncs the change
 * to Stripe so billing matches the platform state. All calls are
 * non-blocking — the admin action succeeds even if Stripe sync fails.
 */

import { stripe, STRIPE_PRICE_MAP, getSubscriptionItemId } from '@/lib/stripe'
import prisma from '@/lib/prisma'
import type { PlanTier } from '@/lib/pricing'

/**
 * Sync an admin plan action to Stripe.
 * Only acts if the user has an active Stripe subscription.
 */
export async function syncAdminPlanAction(
  userId: string,
  planAction: string,
  targetPlan: PlanTier,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeSubscriptionId: true, stripeCustomerId: true, gracePeriodEndsAt: true },
  })

  // No Stripe subscription — nothing to sync (user may have been set up via admin without Stripe)
  if (!user?.stripeSubscriptionId) return

  const subscriptionId = user.stripeSubscriptionId

  switch (planAction) {
    case 'upgrade': {
      const priceId = STRIPE_PRICE_MAP[targetPlan]
      if (!priceId) break

      const itemId = await getSubscriptionItemId(subscriptionId)
      if (!itemId) break

      await stripe.subscriptions.update(subscriptionId, {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: 'always_invoice',
      })
      console.log(`[stripe-sync] Upgraded subscription ${subscriptionId} to ${targetPlan}`)
      break
    }

    case 'downgrade_immediate': {
      if (targetPlan === 'FREE') {
        // Cancel Stripe subscription immediately
        await stripe.subscriptions.cancel(subscriptionId)
        // Clear the subscription ID since it's now cancelled
        await prisma.user.update({
          where: { id: userId },
          data: { stripeSubscriptionId: null },
        })
        console.log(`[stripe-sync] Cancelled subscription ${subscriptionId} (downgrade to FREE)`)
      } else {
        // Switch to lower paid plan
        const priceId = STRIPE_PRICE_MAP[targetPlan]
        if (!priceId) break

        const itemId = await getSubscriptionItemId(subscriptionId)
        if (!itemId) break

        await stripe.subscriptions.update(subscriptionId, {
          items: [{ id: itemId, price: priceId }],
          proration_behavior: 'always_invoice',
        })
        console.log(`[stripe-sync] Downgraded subscription ${subscriptionId} to ${targetPlan}`)
      }
      break
    }

    case 'downgrade_grace': {
      if (targetPlan === 'FREE') {
        // Schedule cancellation at end of grace period
        const cancelAt = user.gracePeriodEndsAt
          ? Math.floor(user.gracePeriodEndsAt.getTime() / 1000)
          : undefined

        if (cancelAt) {
          await stripe.subscriptions.update(subscriptionId, {
            cancel_at: cancelAt,
          })
        } else {
          // Fallback: cancel at period end
          await stripe.subscriptions.update(subscriptionId, {
            cancel_at_period_end: true,
          })
        }
        console.log(`[stripe-sync] Scheduled cancellation for subscription ${subscriptionId}`)
      } else {
        // Switch to lower paid plan immediately (grace is for access, billing changes now)
        const priceId = STRIPE_PRICE_MAP[targetPlan]
        if (!priceId) break

        const itemId = await getSubscriptionItemId(subscriptionId)
        if (!itemId) break

        await stripe.subscriptions.update(subscriptionId, {
          items: [{ id: itemId, price: priceId }],
          proration_behavior: 'always_invoice',
        })
        console.log(`[stripe-sync] Downgraded subscription ${subscriptionId} to ${targetPlan} (with grace)`)
      }
      break
    }

    case 'cancel_downgrade': {
      // Remove scheduled cancellation
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at: '',
        cancel_at_period_end: false,
      })
      console.log(`[stripe-sync] Cancelled scheduled downgrade for subscription ${subscriptionId}`)
      break
    }
  }
}
