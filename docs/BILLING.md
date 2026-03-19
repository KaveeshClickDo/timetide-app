# TimeTide Billing & Subscription System

Complete documentation for the app-managed subscription system, payment processing, plan enforcement, and admin management.

## Overview

TimeTide uses a three-tier plan system (FREE, PRO, TEAM) with **app-managed subscriptions**. The app controls all subscription lifecycle (plans, limits, billing cycles, cancellation, upgrades, downgrades, recurring payments). Stripe is used **only** to collect card details and process charges — no Stripe subscriptions, products, or webhooks are involved.

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

**Configuration**: Plan tiers and limits are stored in the `Plan` database table and cached in memory (5-min TTL). Client-safe sync helpers in `src/lib/pricing.ts`, async DB functions in `src/lib/pricing-server.ts`. Admin can edit plans at `/admin/plans`.

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

## Payment Architecture

### Overview

```
App decides → charges Stripe → records result
```

Stripe is a **payment processor only**. No Stripe subscriptions, products, prices, webhooks, or Customer Portal. The app manages:
- Plan activation/deactivation
- Billing cycles (`planExpiresAt`)
- Recurring charges (background job)
- Upgrades with proration
- Cancellation and downgrades
- Invoice emails

### Environment Variables

```env
# Only this is needed — no webhook secret, no price IDs, no publishable key
STRIPE_SECRET_KEY="sk_..."
```

### Payment Flows

#### First Subscription
1. User selects plan → `POST /api/billing/checkout` → Stripe Checkout (`mode: 'payment'`, `setup_future_usage: 'off_session'`)
2. Stripe charges first month AND saves payment method
3. Redirect to `/dashboard/billing?success=true&session_id=cs_xxx`
4. Billing page calls `POST /api/billing/checkout/callback` to verify and activate plan
5. Payment recorded in `Payment` table, invoice email sent

#### Recurring Renewal (Background Job)
1. BullMQ job runs every hour, finds users with `planExpiresAt` within 24h
2. Charges saved payment method via `stripe.paymentIntents.create({ off_session: true, confirm: true })`
3. Success → extends plan by 30 days, records payment, sends invoice email
4. Failure → retries up to 3 times over 3 days, then starts 7-day grace period

#### Cancel
1. User clicks "Cancel" → `POST /api/billing/cancel`
2. App sets status = `UNSUBSCRIBED`, keeps `planExpiresAt` (features active until then)
3. Background job stops renewing when period ends, starts grace period

#### Upgrade (PRO → TEAM mid-cycle)
1. User selects higher plan → `POST /api/billing/upgrade`
2. App calculates proration: `remainingDays × (newPrice - oldPrice) / cycleDays`
3. Charges proration via PaymentIntent
4. Updates plan immediately, keeps same `planExpiresAt`
5. Next renewal uses new plan's price

#### Downgrade
1. `POST /api/billing/schedule-downgrade` → `DOWNGRADING` status
2. No Stripe calls — purely app-managed state transition
3. At period end, resources locked at target plan level

#### Payment Method Update
1. `POST /api/billing/update-payment-method` → Stripe Checkout (`mode: 'setup'`)
2. On redirect, `POST /api/billing/update-payment-method/callback` saves new card

### Checkout Recovery (Edge Case Handling)

If a user pays but the redirect/callback fails (browser closed, network error):
- **Billing page**: On mount, calls `POST /api/billing/recover-checkout` to check Stripe for unprocessed sessions
- **Background job**: `recover_unprocessed_checkouts` runs every 30 minutes

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/billing/checkout` | POST | Create Stripe Checkout session (payment mode) |
| `/api/billing/checkout/callback` | POST | Verify payment and activate plan |
| `/api/billing/cancel` | POST | Cancel subscription (no Stripe calls) |
| `/api/billing/upgrade` | POST | Upgrade with proration charge |
| `/api/billing/schedule-downgrade` | POST | Schedule downgrade at period end |
| `/api/billing/schedule-downgrade` | DELETE | Cancel scheduled downgrade |
| `/api/billing/update-payment-method` | POST | Redirect to Stripe setup mode |
| `/api/billing/update-payment-method/callback` | POST | Save new payment method |
| `/api/billing/recover-checkout` | POST | Recover unprocessed checkout sessions |
| `/api/plans` | GET | Public plans list (no auth) |

### Payment Emails

Three HTML email templates sent via BullMQ email queue:
- **Payment Success**: Green themed, invoice number, plan details, card info, billing period
- **Payment Failed**: Red themed, failure reason, "Update Payment Method" CTA
- **Payment Refunded**: Blue themed, refund/original amounts, reason

Invoice numbers: `TT-YYYYMM-XXXXXX` (year-month + last 6 chars of payment ID)

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
  "subscriptionStatus": "ACTIVE"
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

### Admin Payment Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/payments` | GET | Paginated payment history (filter by status, type, user) |
| `/api/admin/payments/[id]/refund` | POST | Full or partial refund via Stripe |
| `/api/admin/plans` | GET/POST | List/create plans |
| `/api/admin/plans/[id]` | GET/PATCH/DELETE | Manage individual plan |

Admin plan changes are purely app-side — no Stripe subscription sync needed.

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

BullMQ Redis-backed queue with recurring jobs:

| Job | Frequency | Action |
|-----|-----------|--------|
| `check_expirations` | Every 15 min | Transitions ACTIVE/UNSUBSCRIBED → GRACE_PERIOD when `planExpiresAt` passed |
| `check_grace_periods` | Every 15 min | Transitions GRACE_PERIOD/DOWNGRADING → LOCKED when `gracePeriodEndsAt` passed |
| `process_renewals` | Every hour | Charges saved payment methods for users due within 24h |
| `recover_unprocessed_checkouts` | Every 30 min | Recovers Stripe payments where callback failed |

**One-off jobs:**
- `retry_failed_payment` — scheduled after payment failure (up to 3 retries at +24h, +48h, +72h)
- `send_warning` — scheduled at specific times for expiring/grace ending notifications

**Grace period special cases:**
- `DOWNGRADING` with user-scheduled downgrade (paid→paid): extends grace 7 more days for user to subscribe to new plan
- `DOWNGRADING` with admin-initiated (paid→paid): reactivates to ACTIVE at target plan

### Warning Emails

Scheduled as one-off delayed jobs:
- **Expiring warnings**: Sent before `planExpiresAt`
- **Grace ending warnings**: Sent 2 days and 1 day before `gracePeriodEndsAt`

---

## Key Files

| Purpose | File |
|---------|------|
| Plan tiers & limits (client-safe) | `src/lib/pricing.ts` |
| Plan config from DB (server-only) | `src/lib/pricing-server.ts` |
| Server-side enforcement | `src/lib/plan-enforcement.ts` |
| Subscription lifecycle | `src/lib/subscription-lifecycle.ts` |
| Stripe payment helpers | `src/lib/stripe.ts` |
| Checkout endpoint | `src/app/api/billing/checkout/route.ts` |
| Checkout callback | `src/app/api/billing/checkout/callback/route.ts` |
| Cancel endpoint | `src/app/api/billing/cancel/route.ts` |
| Upgrade endpoint | `src/app/api/billing/upgrade/route.ts` |
| Schedule downgrade | `src/app/api/billing/schedule-downgrade/route.ts` |
| Payment method update | `src/app/api/billing/update-payment-method/route.ts` |
| Checkout recovery | `src/app/api/billing/recover-checkout/route.ts` |
| Public plans API | `src/app/api/plans/route.ts` |
| Subscription queue | `src/lib/infrastructure/queue/subscription-queue.ts` |
| Admin plan management | `src/app/api/admin/plans/route.ts` |
| Admin payments & refunds | `src/app/api/admin/payments/route.ts` |
| Admin user management | `src/app/api/admin/users/[id]/route.ts` |
| Downgrade preview | `src/app/api/admin/users/[id]/downgrade-preview/route.ts` |
| Client-side feature gate | `src/hooks/use-feature-gate.ts` |
| Billing page | `src/app/dashboard/billing/page.tsx` |
| Admin plans page | `src/app/admin/plans/page.tsx` |
| Admin payments page | `src/app/admin/payments/page.tsx` |

---

*Last updated: March 2026*
