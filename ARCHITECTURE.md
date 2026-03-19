# TimeTide.app - Architecture Documentation

## Overview

TimeTide is a modern, self-hostable scheduling platform built with Next.js 14 (App Router), TypeScript, and PostgreSQL. It provides individual and team scheduling with calendar integration, video conferencing, webhooks, analytics, and a tiered plan system.

## System Architecture

```
+------------------------------------------------------------------+
|                        CLIENT LAYER                               |
|  React 18 + Tailwind CSS + Shadcn/UI + React Query v5            |
|  SessionProvider (NextAuth) + QueryClientProvider                 |
+------------------------------------------------------------------+
         |                    |                    |
    Public Pages        Dashboard Pages       Booking Widgets
    (SSR/SSG)           (Client-side)         (Client-side)
         |                    |                    |
+------------------------------------------------------------------+
|                      MIDDLEWARE LAYER                              |
|  src/middleware.ts                                                |
|  - Route protection (JWT validation)                              |
|  - Email verification redirect                                    |
|  - Onboarding completion redirect                                 |
+------------------------------------------------------------------+
         |
+------------------------------------------------------------------+
|                       API LAYER                                   |
|  Next.js API Routes (src/app/api/)                               |
|  - 88 endpoints across 15 resource groups                        |
|  - Zod validation on all inputs                                   |
|  - Plan enforcement (server-side feature gating)                  |
|  - Rate limiting (Redis-backed with in-memory fallback)           |
+------------------------------------------------------------------+
         |                    |                    |
+------------------------------------------------------------------+
|                     SERVICE LAYER                                 |
|  SlotCalculator    | TeamCalculator  | PlanEnforcement            |
|  CalendarSync      | Notifications   | WebhookDelivery            |
|  EmailService      | RecurringUtils  | ZoomIntegration            |
|  StripeClient      | SubscriptionLifecycle | AdminSync              |
+------------------------------------------------------------------+
         |                    |                    |
+------------------------------------------------------------------+
|                   BACKGROUND JOBS (BullMQ)                        |
|  EmailQueue | WebhookQueue | CalendarSyncQueue | ReminderQueue    |
|  SubscriptionQueue (expiration checks, grace period processing)   |
|  Redis-backed with retry logic and rate limiting                  |
+------------------------------------------------------------------+
         |
+------------------------------------------------------------------+
|                      DATA LAYER                                   |
|  Prisma ORM v7.3 → PostgreSQL 16                                 |
|  24+ models, 12+ enums, 15 migrations                             |
+------------------------------------------------------------------+
         |
+------------------------------------------------------------------+
|                   EXTERNAL SERVICES                               |
|  Google Calendar | Microsoft Graph | Zoom | Resend | Stripe       |
+------------------------------------------------------------------+
```

## Directory Structure

```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # REST API endpoints
│   │   ├── auth/                 # NextAuth + signup, verify, reset
│   │   ├── availability/         # Schedule CRUD
│   │   ├── bookings/             # Booking CRUD + reschedule + series
│   │   ├── calendars/            # Calendar connect + OAuth callbacks
│   │   ├── event-types/          # Event type CRUD
│   │   ├── analytics/            # Booking analytics aggregation
│   │   ├── notifications/        # In-app notifications
│   │   ├── slots/                # Available slot calculation
│   │   ├── teams/                # Team CRUD + members + invitations
│   │   ├── users/                # User profile + avatar
│   │   ├── webhooks/             # Webhook CRUD + test + retry + Stripe handler
│   │   ├── billing/              # Stripe checkout, portal, schedule downgrade
│   │   ├── admin/                # Admin panel API (users, teams, tickets, audit)
│   │   ├── tickets/              # User support tickets
│   │   ├── zoom/                 # Zoom OAuth + status
│   │   ├── public/               # Public event types + team info
│   │   └── contact/              # Contact form
│   ├── auth/                     # Auth pages (7 pages)
│   ├── admin/                    # Admin panel pages (8 pages)
│   ├── dashboard/                # Protected pages (10+ pages)
│   ├── bookings/                 # Public booking views
│   ├── team/                     # Public team booking pages
│   ├── [username]/               # Public user booking pages
│   ├── layout.tsx                # Root layout (SEO, fonts, providers)
│   └── page.tsx                  # Landing page (server component)
├── components/
│   ├── ui/                       # 18 Shadcn/UI primitives
│   ├── booking/                  # BookingWidget, TeamBookingWidget
│   ├── providers.tsx             # SessionProvider + QueryClientProvider
│   ├── pricing-card.tsx          # Reusable pricing tier card
│   ├── upgrade-banner.tsx        # Dismissible upgrade CTA (7-day)
│   ├── upgrade-modal.tsx         # Feature upgrade dialog
│   ├── pro-badge.tsx             # Inline plan badge with lock icon
│   ├── feature-gate-page.tsx     # Full-page feature lock
│   ├── notification-dropdown.tsx # Bell icon + notification list
│   ├── public-navbar.tsx         # Landing page nav
│   └── public-footer.tsx         # Landing page footer
├── hooks/
│   ├── use-feature-gate.ts       # Client-side plan limit checking
│   ├── use-notifications.ts      # Notification fetching + marking
│   └── use-integration-status.ts # Calendar/Zoom connection status
├── lib/
│   ├── auth.ts                   # NextAuth config (JWT, providers)
│   ├── prisma.ts                 # Prisma client singleton
│   ├── pricing.ts                # PRICING_TIERS, PLAN_LIMITS, helpers
│   ├── plan-enforcement.ts       # Server-side checkNumericLimit/checkFeatureAccess
│   ├── notifications.ts          # createNotification, message builders
│   ├── constants.ts              # Location types, durations, timezones
│   ├── utils.ts                  # cn(), formatDate/Time, slugify
│   ├── calendar/
│   │   ├── google.ts             # Google Calendar OAuth + CRUD + busy times
│   │   └── outlook.ts            # Outlook OAuth + CRUD + busy times
│   ├── email/
│   │   └── client.ts             # Resend email templates (23 types)
│   ├── slots/
│   │   ├── calculator.ts         # Core slot calculation engine
│   │   └── team-calculator.ts    # Team scheduling (RR/Collective/Managed)
│   ├── stripe.ts                 # Stripe client, helpers, price mapping
│   ├── stripe-admin-sync.ts      # Non-blocking admin→Stripe sync
│   ├── subscription-lifecycle.ts  # Subscription state machine + resource locking
│   ├── admin-auth.ts             # Admin authorization helper
│   ├── admin-audit.ts            # Admin action logging
│   ├── queue/
│   │   ├── email-queue.ts        # BullMQ email queue with retry
│   │   ├── webhook-queue.ts      # HMAC-signed webhook delivery
│   │   ├── calendar-sync-queue.ts
│   │   ├── reminder-queue.ts
│   │   ├── subscription-queue.ts # Expiration + grace period checks (every 15m)
│   │   ├── redis.ts              # Redis connection
│   │   └── rate-limiter.ts       # IP-based + admin rate limiting
│   ├── recurring/
│   │   └── utils.ts              # Recurring date generation
│   ├── validation/
│   │   └── schemas.ts            # 23 Zod schemas + type exports
│   └── zoom/
│       └── index.ts              # Zoom OAuth + meeting CRUD
├── middleware.ts                  # Route protection
└── globals.css                   # Tailwind + custom ocean theme
```

## Key Design Decisions

### 1. JWT-Based Sessions (Not Database Sessions)
- **Why**: Scalability. No database lookup per request.
- **Implementation**: NextAuth JWT strategy with 30-day expiry.
- **Trade-off**: Can't invalidate sessions immediately (mitigated by periodic user verification every 5 minutes in JWT callback).

### 2. Slot Calculation Engine
The slot calculator is the core scheduling algorithm with multiple safety mechanisms:

```
Input: Event type config + Host availability + Calendar busy times
                        |
                        v
    +------------------------------------------+
    | 1. Determine date range                  |
    |    - ROLLING: today + N days             |
    |    - RANGE: explicit start/end           |
    |    - UNLIMITED: 90-day window            |
    +------------------------------------------+
                        |
    +------------------------------------------+
    | 2. For each day in range:                |
    |    a. Get weekly availability slots       |
    |    b. Apply date overrides               |
    |    c. Generate candidate slots            |
    |    d. Filter: calendar busy times         |
    |    e. Filter: existing bookings (ALL      |
    |       event types, not just current)      |
    |    f. Filter: buffer times               |
    |    g. Filter: minimum notice             |
    |    h. Filter: daily booking limits        |
    +------------------------------------------+
                        |
    +------------------------------------------+
    | 3. Safety limits:                        |
    |    MAX_SLOTS_PER_DAY = 100               |
    |    MAX_DAYS_TO_PROCESS = 90              |
    |    MIN_SLOT_INTERVAL = 5 minutes         |
    +------------------------------------------+
                        |
                        v
    Output: Available slots grouped by date
```

**Critical**: Double-booking prevention checks ALL host bookings across ALL event types, not just the current one.

### 3. Team Scheduling Modes

| Mode | Algorithm | Use Case |
|------|-----------|----------|
| **ROUND_ROBIN** | Rotates `lastAssignedMemberId` on event type | Sales demos, support calls |
| **COLLECTIVE** | Only shows slots where ALL members are free | Team meetings, interviews |
| **MANAGED** | Shows all host slots, member assigned later | Admin-coordinated scheduling |

### 4. Plan Enforcement (Two Layers)

**Server-side** (`plan-enforcement.ts`):
- `checkNumericLimit()` - Event types, calendars, webhooks count limits
- `checkFeatureAccess()` - Boolean feature gates (teams, analytics, etc.)
- `checkEventTypeFeatures()` - Pro features (buffers, custom questions, recurring)
- Returns 403 response if plan insufficient

**Client-side** (`use-feature-gate.ts` hook):
- Checks session user plan against PLAN_LIMITS
- Returns `canAccess`, `requiresUpgrade`, `requiredPlan`
- Used by ProBadge, UpgradeModal, FeatureGatePage components

### 5. Webhook Delivery System
- HMAC-SHA256 signature in `X-Webhook-Signature` header
- BullMQ queue with 5 retry attempts (exponential backoff: 10s → 160s)
- Automatic webhook disable after 50 consecutive failures
- Delivery tracking with success/failure counts

### 6. Calendar Integration Pattern
- OAuth token management with automatic refresh (5 min before expiry)
- Graceful degradation: calendar errors don't fail bookings
- Busy time aggregation across all connected calendars per user
- Event creation with conference link generation (Meet/Teams/Zoom)

### 7. Background Job Architecture
```
BullMQ Queues (Redis-backed):
├── email-queue           # 3 retries, 1s backoff, 5 concurrent
├── webhook-queue         # 5 retries, 10s backoff
├── calendar-sync-queue   # 15-min recurring sync
├── reminder-queue        # Scheduled 24h + 1h before bookings
└── subscription-queue    # 15-min checks: expirations + grace periods

Fallback: Direct execution when Redis unavailable
Worker initialization: src/instrumentation.ts (Next.js experimental)
```

### 8. Subscription Lifecycle

> Full details: [docs/BILLING.md](docs/BILLING.md)

```
State Machine: NONE → ACTIVE → UNSUBSCRIBED → GRACE_PERIOD → LOCKED
                              └→ DOWNGRADING → (lock at target plan)

Key Functions (src/lib/subscription-lifecycle.ts):
├── activateSubscription()      # Subscribe / upgrade / reactivate
├── voluntaryUnsubscribe()      # User cancels
├── startGracePeriod()          # 7-day grace after expiry
├── lockResources()             # Lock event types, webhooks, team events
├── reactivateResources()       # Unlock on upgrade from LOCKED
├── adminDowngradeImmediate()   # Admin: immediate downgrade + lock
├── adminDowngradeWithGrace()   # Admin: scheduled downgrade
├── scheduleUserDowngrade()     # User: scheduled plan change
└── cancelDowngrade()           # Cancel any scheduled downgrade
```

**Pattern**: DB changes first, Stripe sync second, warn on failure.

### 9. Admin Panel Architecture
```
/admin/* routes → requireAdmin() middleware → Admin API routes
                                              ├── User management (CRUD + plan actions)
                                              ├── Team management
                                              ├── Booking management
                                              ├── Support tickets
                                              ├── Analytics dashboard
                                              ├── Audit log
                                              └── System health

Security:
├── UserRole enum (USER | ADMIN)
├── ADMIN_EMAILS env var for auto-promotion
├── JWT-based impersonation (originalAdminId)
├── Rate limiting (30 mutations/min per admin)
└── AdminAuditLog model tracks all actions
```

## Data Flow: Booking Creation

```
1. Invitee selects slot on public page
                |
2. POST /api/bookings
                |
3. Rate limit check (IP-based)
                |
4. Zod validation (createBookingSchema)
                |
5. Fetch event type + team assignments
                |
6. Team scheduling logic (if team event):
   - ROUND_ROBIN: Select next member
   - COLLECTIVE: Verify all available
   - MANAGED: Use event owner
                |
7. Verify slot availability:
   - Calendar busy times (Google/Outlook)
   - ALL host bookings (across all event types)
   - Buffer times, minimum notice, daily limits
   - For group events: seat capacity check
                |
8. For recurring: validate ALL future occurrences
                |
9. Create booking record(s) in database
                |
10. Async operations (fire-and-forget):
    - Create calendar event (Meet/Teams/Zoom link)
    - Queue confirmation email
    - Queue reminder email
    - Trigger webhook (booking.created)
    - Create in-app notification
    - Update analytics counter
                |
11. Return booking confirmation
```

## Authentication Flow

```
OAuth (Google):
  Click Login → Redirect to Google → Callback → Create/Link Account → JWT → Cookie

Credentials:
  Email + Password → Zod Validation → bcrypt Verify → JWT → Cookie

Signup:
  Zod Validation → Check Existing → bcrypt Hash → Create User →
  Generate Username → Create Default Schedule (Mon-Fri 9-5) →
  Create Default Event Type → Send Verification Email

Middleware Protection:
  Request → Check JWT Token → Verify user.id exists →
  Check email verified → Check onboarding complete → Allow/Redirect
```

## Security Model

| Layer | Implementation |
|-------|---------------|
| **Authentication** | NextAuth JWT (30-day), Google OAuth, bcrypt (12 rounds) |
| **Authorization** | Middleware route protection, API-level ownership checks, team role enforcement |
| **Input Validation** | Zod schemas on all API endpoints |
| **SQL Injection** | Prevented by Prisma ORM parameterized queries |
| **XSS Prevention** | React default escaping, HTML escaping in email templates |
| **CSRF** | Built into NextAuth |
| **Rate Limiting** | Redis-backed per-IP (in-memory fallback for dev) |
| **Webhook Security** | HMAC-SHA256 signatures |
| **Password Storage** | bcrypt with 12 salt rounds |
| **Token Management** | OAuth tokens in database, automatic refresh |
| **Stripe Webhooks** | Signature verification via `STRIPE_WEBHOOK_SECRET` |
| **Admin Actions** | Rate limited, audit logged, role-gated |
| **Plan Enforcement** | Server-side numeric + boolean limits, defense-in-depth `lockedByDowngrade` checks |

## State Management

| Type | Technology | Usage |
|------|-----------|-------|
| **Server State** | React Query v5 | API data fetching, caching, mutations |
| **Auth State** | NextAuth `useSession()` | User session, plan, timezone |
| **Form State** | React Hook Form + Zod | All forms with validation |
| **UI State** | React `useState` | Modals, tabs, toggles |
| **Persistent UI** | localStorage | Banner dismissals, chart preferences, timezone |
| **URL State** | Query params | Onboarding step, billing highlight |

## Performance Considerations

- Slot calculation uses safety limits to prevent memory/CPU issues
- React Query with 1-minute stale time reduces redundant API calls
- Calendar API calls use graceful degradation (empty array on error)
- Webhook delivery uses background queue to avoid blocking API responses
- Email sending is async (fire-and-forget with queue fallback)
- Next.js standalone output mode for optimized Docker images

---

*Last updated: March 2026*
