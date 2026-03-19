# TimeTide Billing & Subscription System

Complete documentation for Stripe integration, subscription lifecycle, plan enforcement, and admin subscription management.

## Overview

TimeTide uses a three-tier plan system (FREE, PRO, TEAM) with Stripe for payment processing. The subscription lifecycle manages state transitions, grace periods, resource locking, and automatic cleanup via background jobs.

---

## Plan Tiers

| Feature | FREE | PRO ($12/mo) | TEAM ($20/user/mo) |
|---------|------|-------------|-------------------|
| Event Types | 1 | Unlimited | Unlimited |
| Webhooks | 0 | 10 | Unlimited |
| Custom Questions | No | Yes | Yes |
| Group Booking | No | Yes | Yes |
| Recurring Booking | No | Yes | Yes |
| Team Scheduling | No | No | Yes |
| Analytics | No | No | Yes |

**Configuration**: All limits defined in `src/lib/pricing.ts` as `PLAN_LIMITS` object. This is the single source of truth — no hardcoded plan checks anywhere.

---

## Subscription State Machine

```
                    ┌─────────────────────────┐
                    │          NONE            │  (Free users, never subscribed)
                    └───────────┬──────────────┘
                                │ Subscribe (Stripe checkout)
                                ▼
                    ┌─────────────────────────┐
         ┌─────────│         ACTIVE           │◄──── Renew / Upgrade / Reactivate
         │         └───────────┬──────────────┘
         │                     │
         │        Cancel sub   │   Plan expires (billing period ends)
         │                     ▼
         │         ┌─────────────────────────┐
         │         │      UNSUBSCRIBED       │  (Cancelled but period still active)
         │         └───────────┬──────────────┘
         │                     │
         │                     │  Billing period expires
         │                     ▼
         │         ┌─────────────────────────┐
         │         │      GRACE_PERIOD       │  (7-day grace to resubscribe)
         │         └───────────┬──────────────┘
         │                     │
         │                     │  Grace period ends
         │                     ▼
         │         ┌─────────────────────────┐
         │         │         LOCKED          │  (Features locked, data preserved)
         │         └─────────────────────────┘
         │                     │
         │                     │  Upgrade (reactivate)
         │                     ▼
         │              Back to ACTIVE
         │
         │  User schedules downgrade
         │                     │
         │         ┌─────────────────────────┐
         └────────►│      DOWNGRADING        │  (Scheduled plan change)
                   └───────────┬──────────────┘
                               │  Grace period ends
                               ▼
                        Resources locked at target plan level
                        Status → ACTIVE (paid→paid) or LOCKED (→FREE)
```

### Status Definitions

| Status | Meaning | Features |
|--------|---------|----------|
| `NONE` | Never subscribed, free user | FREE plan features only |
| `ACTIVE` | Paid subscription active | Full plan features |
| `UNSUBSCRIBED` | Cancelled, billing period still active | Full plan features until period ends |
| `GRACE_PERIOD` | Billing expired, 7-day grace window | Full plan features during grace |
| `DOWNGRADING` | Scheduled plan change pending | Current plan features until grace ends |
| `LOCKED` | Subscription expired, resources locked | FREE plan features, locked resources preserved |

---

## Stripe Integration

### Environment Variables

```env
# Required for billing
STRIPE_SECRET_KEY="sk_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_..."

# Price IDs from Stripe Dashboard
STRIPE_PRICE_PRO_MONTHLY="price_..."
STRIPE_PRICE_TEAM_MONTHLY="price_..."
```

### API Endpoints

#### `POST /api/billing/checkout`
Create or update a Stripe subscription.

**Request:**
```json
{ "plan": "PRO" | "TEAM" }
```

**Logic:**
1. Validates plan is PRO or TEAM
2. Blocks downgrades (must use schedule-downgrade)
3. Blocks if user already on same plan with ACTIVE status
4. Blocks if DOWNGRADING (must cancel scheduled switch first)
5. Gets or creates Stripe customer (stored in `User.stripeCustomerId`)
6. If existing subscription: updates price with proration
7. If new: creates Stripe checkout session

**Response:**
```json
{ "url": "https://checkout.stripe.com/..." }
```

#### `POST /api/billing/schedule-downgrade`
Schedule a plan downgrade at end of billing period.

**Request:**
```json
{ "plan": "FREE" | "PRO" }
```

**Logic:**
1. Validates target is lower than current plan
2. Calls `voluntaryUnsubscribe()` if status is ACTIVE
3. Calls `scheduleUserDowngrade()` → sets DOWNGRADING status
4. Syncs to Stripe (non-blocking): `cancel_at_period_end: true`

**Response:**
```json
{
  "success": true,
  "switchDate": "2026-04-19T00:00:00.000Z",
  "message": "Your plan will switch to FREE on 4/19/2026"
}
```

#### `DELETE /api/billing/schedule-downgrade`
Cancel a scheduled downgrade.

**Logic:**
1. Calls `cancelDowngrade()` → restores ACTIVE status
2. Syncs to Stripe (non-blocking): removes `cancel_at_period_end`

#### `POST /api/billing/portal`
Redirect to Stripe Customer Portal for invoice/payment management.

#### `POST /api/webhooks/stripe`
Handles Stripe webhook events. Always returns `{received: true}` to prevent retries.

| Event | Handler |
|-------|---------|
| `customer.subscription.created` | Extract plan from price ID, call `activateSubscription()` |
| `customer.subscription.updated` | Detect cancel/uncancel/plan change, route to appropriate lifecycle function |
| `customer.subscription.deleted` | Clear subscription ID, start grace period |
| `invoice.payment_succeeded` | Renew subscription (skip first invoice, handled by subscription.created) |
| `invoice.payment_failed` | Start grace period when Stripe stops retrying |

### Stripe Sync Pattern

All plan changes follow: **DB first, Stripe second, warn on failure**.

```
1. Validate transition
2. Update database (lifecycle function)
3. Try sync to Stripe
4. If Stripe fails: log error, return { ...data, stripeSyncSuccess: false, warning: "..." }
```

This ensures plan changes always succeed locally. Stripe sync failures are surfaced to the admin/user but don't block the action.

---

## Plan Enforcement

### Server-Side (`src/lib/plan-enforcement.ts`)

| Function | Purpose | Returns |
|----------|---------|---------|
| `checkNumericLimit(plan, limitKey, currentCount)` | Check if user exceeds event type / webhook limit | `NextResponse 403` or `null` |
| `checkFeatureAccess(plan, featureKey)` | Check boolean feature access | `NextResponse 403` or `null` |
| `checkEventTypeFeatures(plan, body)` | Validate custom questions, group booking, recurring | `NextResponse 403` or `null` |
| `checkSubscriptionNotLocked(status)` | Block actions if user is LOCKED | `NextResponse 403` or `null` |
| `getTeamOwnerPlan(teamId)` | Get team owner's plan for team feature gating | `{ plan, subscriptionStatus }` |

**Error Response (403):**
```json
{
  "error": "Event type limit reached (1 of 1). Upgrade to PRO for unlimited event types.",
  "code": "PLAN_LIMIT",
  "requiredPlan": "PRO",
  "limit": 1,
  "current": 1
}
```

### Client-Side (`src/hooks/use-feature-gate.ts`)

```typescript
const { canAccess, requiresUpgrade, requiredPlan } = useFeatureGate('teams')
```

Used by: `ProBadge`, `UpgradeModal`, `FeatureGatePage` components.

### Defense-in-Depth

All public booking endpoints include `lockedByDowngrade: false` in queries:
- `GET /api/public/event-types`
- `GET /api/slots`
- `POST /api/bookings`
- `GET /api/public/teams/[teamSlug]`

Team endpoints use `PLAN_LIMITS[ownerPlan]?.teams` (not hardcoded `!== 'TEAM'`).

---

## Resource Locking & Reactivation

### `lockResources(userId, targetPlan, reason, initiatedBy)`

Called when subscription transitions to LOCKED or when admin downgrades immediately.

1. **Personal event types**: Keeps first N active (ordered by updatedAt desc), locks the rest via `lockedByDowngrade: true`
2. **Webhooks**: If `maxWebhooks === 0`, locks all. Otherwise locks excess beyond limit.
3. **Team event types**: If `!PLAN_LIMITS[targetPlan].teams`, locks all active team events for owned teams
4. **User status**: Sets `subscriptionStatus: 'LOCKED'`, clears dates

Uses atomic `updateMany` with WHERE conditions to prevent race conditions.

### `reactivateResources(userId)`

Called when upgrading from LOCKED status:
- Unlocks all event types with `lockedByDowngrade: true`
- Reactivates all webhooks with `lockedByDowngrade: true`
- Reactivates team event types

---

## Admin Subscription Management

### Admin Endpoints

#### `PATCH /api/admin/users/[id]`

Admin can perform plan actions via `planAction` field:

| Action | Required Fields | Effect |
|--------|----------------|--------|
| `upgrade` | `plan` (PRO or TEAM) | Activates subscription, unlocks resources if LOCKED |
| `downgrade_immediate` | `plan` (target) | Locks resources immediately |
| `downgrade_grace` | `plan`, `gracePeriodDays` | Schedules downgrade with grace period |
| `cancel_downgrade` | — | Cancels scheduled downgrade, restores ACTIVE |

**Validation:**
- `VALID_ADMIN_TRANSITIONS` map validates status → action compatibility
- Plan direction validated (upgrade target must be higher, downgrade lower)
- Zod schema validates `planAction` + `plan` cross-field requirements
- Rate limited: 30 requests per 60 seconds per admin

**Response includes:**
```json
{
  "id": "...",
  "plan": "PRO",
  "subscriptionStatus": "ACTIVE",
  "stripeSyncSuccess": true,
  "warning": "Plan updated, but Stripe billing sync failed. Check Stripe dashboard."
}
```

#### `GET /api/admin/users/[id]/downgrade-preview?targetPlan=FREE`

Read-only preview of what resources would be locked on downgrade.

**Response:**
```json
{
  "targetPlan": "FREE",
  "currentPlan": "PRO",
  "personalEventTypes": {
    "active": 5, "toLock": 4, "toKeep": 1,
    "items": [{ "id": "...", "title": "Strategy Call", "slug": "strategy-call" }]
  },
  "webhooks": {
    "active": 3, "toLock": 3, "toKeep": 0,
    "items": [{ "id": "...", "name": "Zapier", "url": "https://..." }]
  },
  "teamEventTypes": {
    "active": 2, "toLock": 2,
    "items": [{ "id": "...", "title": "Team Standup", "teamName": "Engineering" }]
  },
  "featuresLost": ["customQuestions", "groupBooking", "recurringBooking"]
}
```

### Admin Stripe Sync (`src/lib/stripe-admin-sync.ts`)

| Admin Action | Stripe Action |
|--------------|---------------|
| Upgrade | Update subscription item to new price (prorate immediately) |
| Downgrade Immediate → FREE | Cancel subscription immediately |
| Downgrade Immediate → paid | Update to lower price |
| Downgrade Grace → FREE | Schedule cancellation at grace end |
| Downgrade Grace → paid | Update price now |
| Cancel Downgrade | Remove scheduled cancellation |

### Structured Errors

Lifecycle functions throw `SubscriptionError` with structured context:

```typescript
class SubscriptionError extends Error {
  code: string           // e.g., 'INVALID_STATUS', 'INVALID_TRANSITION'
  currentStatus: string  // e.g., 'LOCKED'
  currentPlan: string    // e.g., 'FREE'
}
```

Admin API returns these as structured 400 responses for frontend handling.

---

## Background Jobs

### Subscription Queue (`src/lib/infrastructure/queue/subscription-queue.ts`)

BullMQ Redis-backed queue with two recurring jobs (every 15 minutes):

| Job | Checks | Action |
|-----|--------|--------|
| `check_expirations` | Users with `ACTIVE`/`UNSUBSCRIBED` and `planExpiresAt <= now` | Start 7-day grace period |
| `check_grace_periods` | Users with `GRACE_PERIOD`/`DOWNGRADING` and `gracePeriodEndsAt <= now` | Lock resources at target plan |

**Grace period special cases:**
- `DOWNGRADING` with user-scheduled downgrade (paid→paid): extends grace 7 more days for user to subscribe to new plan
- `DOWNGRADING` with admin-initiated (paid→paid): reactivates to ACTIVE (subscription was re-priced in Stripe)

### Warning Emails

Scheduled as one-off delayed jobs:
- **Expiring warnings**: Sent before `planExpiresAt`
- **Grace ending warnings**: Sent 2 days and 1 day before `gracePeriodEndsAt`

---

## Key Files

| Purpose | File |
|---------|------|
| Plan tiers & limits | `src/lib/pricing.ts` |
| Server-side enforcement | `src/lib/plan-enforcement.ts` |
| Subscription lifecycle | `src/lib/subscription-lifecycle.ts` |
| Stripe client & helpers | `src/lib/stripe.ts` |
| Admin Stripe sync | `src/lib/stripe-admin-sync.ts` |
| Checkout endpoint | `src/app/api/billing/checkout/route.ts` |
| Schedule downgrade | `src/app/api/billing/schedule-downgrade/route.ts` |
| Stripe webhooks | `src/app/api/webhooks/stripe/route.ts` |
| Subscription queue | `src/lib/infrastructure/queue/subscription-queue.ts` |
| Admin user management | `src/app/api/admin/users/[id]/route.ts` |
| Downgrade preview | `src/app/api/admin/users/[id]/downgrade-preview/route.ts` |
| Client-side feature gate | `src/hooks/use-feature-gate.ts` |
| Billing page | `src/app/dashboard/billing/page.tsx` |

---

*Last updated: March 2026*
