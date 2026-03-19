# TimeTide - Development Documentation

> Modern scheduling that flows with your time

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture & Folder Structure](#3-architecture--folder-structure)
4. [Features Status](#4-features-status)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Environment Setup](#6-environment-setup)
7. [Key Implementation Details](#7-key-implementation-details)
8. [Known Issues & Technical Debt](#8-known-issues--technical-debt)
9. [Future Improvements](#9-future-improvements)

---

## 1. Project Overview

### What is TimeTide?

TimeTide is a modern, self-hostable scheduling platform that enables users to share their availability and let others book time with them. It provides individual and team scheduling with deep calendar integration, video conferencing, webhooks, analytics, and a tiered plan system.

### Who Is It For?

| User Type | Use Case |
|-----------|----------|
| **Freelancers & Consultants** | Client consultations, discovery calls |
| **Sales Teams** | Demo scheduling, prospect meetings |
| **Customer Support** | Support calls, onboarding sessions |
| **Educators & Coaches** | Tutoring, mentorship, office hours |
| **Healthcare Providers** | Patient consultations (non-clinical) |
| **Recruiters** | Interview scheduling, screenings |

### Core Use Cases

1. **Event Type Creation** - Define bookable meeting templates with custom settings
2. **Availability Sharing** - Set weekly hours and share public booking pages
3. **Booking Management** - Receive, confirm, reschedule, or cancel appointments
4. **Calendar Synchronization** - Two-way sync with Google Calendar and Outlook
5. **Team Scheduling** - Round-robin, collective, and managed team scheduling
6. **Video Conferencing** - Auto-generate Zoom, Google Meet, or Teams links
7. **Recurring Bookings** - Weekly, biweekly, monthly recurring meetings
8. **Webhooks** - External integrations with signed webhook delivery
9. **Analytics** - Booking insights with customizable charts

---

## 2. Tech Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 14.1.0 | React framework with App Router |
| **React** | 18.2.0 | UI component library |
| **TypeScript** | 5.3.3 | Type-safe JavaScript |
| **Tailwind CSS** | 3.4.1 | Utility-first CSS framework |
| **Radix UI** | Various | Accessible UI primitives (Shadcn/UI) |
| **Lucide React** | 0.344.0 | Icon library |
| **React Hook Form** | 7.50.1 | Form state management |
| **React Query** | 5.24.0 | Server state management |
| **React Day Picker** | 8.10.0 | Calendar component |
| **Recharts** | 3.6.0 | Analytics charts |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js API Routes** | 14.1.0 | REST API endpoints |
| **NextAuth.js** | 4.24.6 | Authentication (JWT + OAuth) |
| **Prisma** | 7.3.0 | Database ORM |
| **Zod** | 3.22.4 | Runtime validation |
| **BullMQ** | 5.4.0 | Background job queue |
| **date-fns** | 3.3.1 | Date manipulation |
| **date-fns-tz** | 3.2.0 | Timezone handling |
| **bcryptjs** | 2.4.3 | Password hashing |

### Infrastructure

| Technology | Purpose |
|------------|---------|
| **PostgreSQL 16** | Primary relational database |
| **Redis 7** | Job queue and rate limiting (ioredis 5.3.2) |

### Third-Party Services

| Service | Purpose | Status |
|---------|---------|--------|
| **Resend** | Transactional emails | Implemented |
| **Google Calendar API** | Calendar sync + Google Meet | Implemented |
| **Microsoft Graph API** | Outlook/Teams integration | Implemented |
| **Zoom API** | Video meeting creation | Implemented |

---

## 3. Architecture & Folder Structure

```
timetide-app/
├── prisma/
│   ├── schema.prisma              # Database schema (700+ lines, 20 models)
│   └── migrations/                # 12 migration files
├── src/
│   ├── app/
│   │   ├── api/                   # 50+ API route handlers
│   │   │   ├── auth/              # signup, verify, reset, forgot, check-onboarding
│   │   │   ├── availability/      # CRUD + [id]
│   │   │   ├── bookings/          # CRUD + [id] + reschedule + assign + series
│   │   │   ├── calendars/         # CRUD + google/outlook callbacks + sync + conflicts
│   │   │   ├── event-types/       # CRUD + [id]
│   │   │   ├── analytics/         # Aggregated booking analytics
│   │   │   ├── notifications/     # CRUD + mark-all-read
│   │   │   ├── slots/             # Available slots (individual + team)
│   │   │   ├── teams/             # CRUD + members + invitations + event-types + audit
│   │   │   ├── users/             # Profile + avatar + check-username
│   │   │   ├── webhooks/          # CRUD + test + retry
│   │   │   ├── zoom/              # Connect + callback + disconnect + status
│   │   │   ├── public/            # Public event types + team info
│   │   │   └── contact/           # Contact form
│   │   ├── auth/                  # 7 auth pages
│   │   │   ├── signin/
│   │   │   ├── signup/
│   │   │   ├── forgot-password/
│   │   │   ├── reset-password/[token]/
│   │   │   ├── verify-email/[token]/
│   │   │   ├── verify-email-required/
│   │   │   └── resend-verification/
│   │   ├── dashboard/             # Protected pages
│   │   │   ├── page.tsx           # Bookings list (home)
│   │   │   ├── layout.tsx         # Sidebar + header
│   │   │   ├── onboarding/       # 5-step setup wizard
│   │   │   ├── event-types/      # List + new + [id]/edit
│   │   │   ├── availability/     # Schedule management
│   │   │   ├── bookings/         # Booking details + series
│   │   │   ├── teams/            # Team list + [id] + event-types
│   │   │   ├── webhooks/         # Webhook management
│   │   │   ├── analytics/        # Charts + metrics
│   │   │   ├── billing/          # Plans + usage
│   │   │   └── settings/         # User settings
│   │   ├── bookings/             # Public booking pages
│   │   ├── team/                 # Public team pages
│   │   ├── [username]/           # Public user pages
│   │   ├── invitations/          # Team invitation acceptance
│   │   ├── about-us/
│   │   ├── contact-us/
│   │   ├── privacy-policy/
│   │   ├── terms-conditions/
│   │   ├── layout.tsx            # Root layout
│   │   └── page.tsx              # Landing page
│   ├── components/
│   │   ├── ui/                   # 18 Shadcn/UI components
│   │   ├── booking/
│   │   │   ├── booking-widget.tsx     # 4-step individual booking flow
│   │   │   └── team-booking-widget.tsx # 4-step team booking flow
│   │   ├── providers.tsx              # SessionProvider + QueryClientProvider
│   │   ├── pricing-card.tsx           # Reusable pricing tier card
│   │   ├── upgrade-banner.tsx         # Dismissible upgrade CTA
│   │   ├── upgrade-modal.tsx          # Feature upgrade dialog
│   │   ├── pro-badge.tsx              # Inline plan lock badge
│   │   ├── feature-gate-page.tsx      # Full-page feature lock
│   │   ├── notification-dropdown.tsx  # Notification bell + list
│   │   ├── public-navbar.tsx          # Landing page navigation
│   │   ├── public-footer.tsx          # Landing page footer
│   │   ├── add-to-calendar.tsx        # Add-to-calendar functionality
│   │   ├── embed-code-generator.tsx   # Booking widget embed code
│   │   ├── integration-connect-card.tsx
│   │   ├── pwa-install-banner.tsx
│   │   └── service-worker-register.tsx
│   ├── hooks/
│   │   ├── use-feature-gate.ts        # Client-side plan checking
│   │   ├── use-notifications.ts       # Notification hooks
│   │   └── use-integration-status.ts  # Calendar/Zoom status
│   ├── lib/
│   │   ├── auth.ts                    # NextAuth (JWT, Google OAuth, Credentials)
│   │   ├── prisma.ts                  # Prisma singleton
│   │   ├── pricing.ts                 # PRICING_TIERS, PLAN_LIMITS
│   │   ├── plan-enforcement.ts        # Server-side feature gates
│   │   ├── notifications.ts           # Notification creation + messages
│   │   ├── constants.ts               # Location types, durations, timezones
│   │   ├── utils.ts                   # cn(), format helpers, slugify
│   │   ├── team-audit.ts              # Team audit logging
│   │   ├── oauth-state.ts             # OAuth state encoding
│   │   ├── calendar/
│   │   │   ├── google.ts              # Full Google Calendar integration
│   │   │   └── outlook.ts             # Full Outlook/Graph integration
│   │   ├── email/
│   │   │   └── client.ts              # Resend with 9 email template types
│   │   ├── slots/
│   │   │   ├── calculator.ts          # Core slot calculation engine
│   │   │   └── team-calculator.ts     # Team scheduling algorithms
│   │   ├── queue/
│   │   │   ├── email-queue.ts         # Email queue (3 retries)
│   │   │   ├── webhook-queue.ts       # Webhook delivery (HMAC, 5 retries)
│   │   │   ├── calendar-sync-queue.ts
│   │   │   ├── reminder-queue.ts
│   │   │   ├── redis.ts
│   │   │   ├── rate-limiter.ts
│   │   │   └── index.ts
│   │   ├── recurring/
│   │   │   ├── utils.ts               # Recurring date generation
│   │   │   └── __tests__/
│   │   ├── validation/
│   │   │   ├── schemas.ts             # 23 Zod schemas + types
│   │   │   └── __tests__/
│   │   └── zoom/
│   │       └── index.ts               # Zoom OAuth + meeting CRUD
│   ├── middleware.ts                   # Route protection
│   ├── instrumentation.ts             # Worker initialization
│   ├── env.ts                         # Environment validation
│   └── globals.css                    # Tailwind + ocean theme
├── public/                            # Static assets, PWA manifest
├── scripts/                           # Utility scripts
├── docs/                              # Documentation
├── docker-compose.yml                 # PostgreSQL + Redis + App
├── Dockerfile.dev
├── vitest.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── next.config.js
└── package.json
```

### User Journey Flow

```
1. AUTHENTICATION
   Landing Page → Sign In (OAuth/Credentials) → Email Verification → Onboarding

2. ONBOARDING (5 steps)
   Set Timezone → Configure Availability → Customize URL → Review Events → Connect Integrations

3. SETUP
   Dashboard → Create Event Types → Connect Calendars → Connect Zoom → Set Up Team

4. SHARING
   Share: https://timetide.app/username/event-slug
   Team:  https://timetide.app/team/team-slug/event-slug

5. BOOKING FLOW (Public, 4 steps)
   Select Date → Select Time → Fill Details → Confirmation

6. POST-BOOKING
   Calendar Event Created → Email Sent → Webhook Triggered → Notification Created
```

---

## 4. Features Status

### Legend
- **Completed** - Fully implemented and production-ready
- **Partial** - Core works, some aspects missing

### Authentication & Onboarding

| Feature | Status | Notes |
|---------|--------|-------|
| Google OAuth | Completed | With offline access for calendar |
| Email/Password | Completed | bcrypt hashing (12 rounds) |
| Email Verification | Completed | Token-based, 24h expiry |
| Password Reset | Completed | Token-based flow |
| JWT Sessions | Completed | 30-day expiry, periodic user verification |
| Auto Username | Completed | Generated from email on signup |
| Default Setup | Completed | Mon-Fri 9-5 schedule + default event type |
| 5-Step Onboarding | Completed | Timezone, availability, URL, events, integrations |

### Event Types

| Feature | Status | Notes |
|---------|--------|-------|
| CRUD Operations | Completed | Create, read, update, delete |
| Duration Settings | Completed | 5-1440 minutes |
| Buffer Times | Completed | Before/after (PRO feature) |
| Minimum Notice | Completed | Up to 30 days |
| Booking Window | Completed | Rolling, range, or unlimited |
| Location Types | Completed | 6 types (Meet, Teams, Zoom, Phone, In-Person, Custom) |
| Custom Questions | Completed | 8 question types (PRO feature) |
| Max Bookings/Day | Completed | Per event type limit |
| Requires Confirmation | Completed | Host approval workflow |
| Success Redirect | Completed | Custom post-booking URL |
| Recurring Settings | Completed | Weekly, biweekly, monthly, custom (PRO feature) |
| Group Bookings | Completed | Multi-seat with capacity tracking |

### Availability & Schedules

| Feature | Status | Notes |
|---------|--------|-------|
| Weekly Schedule | Completed | Multiple time slots per day |
| Multiple Schedules | Completed | Named, assignable to event types |
| Default Schedule | Completed | Auto-created on signup |
| Date Overrides | Completed | Custom hours or day off |
| Timezone Support | Completed | 51 timezones with auto-detect |

### Booking Management

| Feature | Status | Notes |
|---------|--------|-------|
| Create Booking | Completed | Public endpoint, rate limited |
| Booking List | Completed | Upcoming, past, cancelled, declined tabs |
| Confirm/Reject | Completed | For approval-required events |
| Cancel Booking | Completed | With reason, triggers notifications |
| Reschedule | Completed | Self-service reschedule |
| Recurring Bookings | Completed | Up to 24 occurrences, series management |
| Group Bookings | Completed | Seat tracking, capacity limits |
| Status Tracking | Completed | PENDING, CONFIRMED, CANCELLED, REJECTED, COMPLETED, SKIPPED |

### Calendar Integration

| Feature | Status | Notes |
|---------|--------|-------|
| Google Calendar Connect | Completed | Full OAuth flow |
| Google Busy Times | Completed | Real-time fetching |
| Google Event Creation | Completed | With Google Meet links |
| Google Event Update/Delete | Completed | On reschedule/cancel |
| Outlook Calendar Connect | Completed | Microsoft Graph API |
| Outlook Busy Times | Completed | Status-aware filtering |
| Outlook Event Creation | Completed | With Teams links |
| Outlook Event Update/Delete | Completed | Full lifecycle |
| Token Auto-Refresh | Completed | 5-min early refresh |
| Multi-Calendar Support | Completed | Aggregate across all calendars |

### Video Conferencing

| Feature | Status | Notes |
|---------|--------|-------|
| Zoom OAuth | Completed | Full OAuth flow |
| Zoom Meeting CRUD | Completed | Create, update, delete |
| Google Meet | Completed | Via Google Calendar API |
| Microsoft Teams | Completed | Via Microsoft Graph API |

### Team Scheduling

| Feature | Status | Notes |
|---------|--------|-------|
| Team CRUD | Completed | Create, update, delete teams |
| Team Members | Completed | Add, remove, update roles |
| Team Roles | Completed | OWNER, ADMIN, MEMBER |
| Team Invitations | Completed | Email-based with accept/decline |
| Team Event Types | Completed | With member assignments |
| Round-Robin | Completed | Rotation tracking via lastAssignedMemberId |
| Collective Scheduling | Completed | All-member availability check |
| Managed Scheduling | Completed | Post-booking assignment |
| Team Booking Pages | Completed | Public at /team/[slug]/[event] |
| Team Audit Log | Completed | Activity tracking |
| Team Logo | Completed | Binary storage |

### Webhooks

| Feature | Status | Notes |
|---------|--------|-------|
| Webhook CRUD | Completed | Create, list, update, delete |
| Event Subscriptions | Completed | 5 event types |
| HMAC Signatures | Completed | SHA256 in X-Webhook-Signature |
| Delivery Tracking | Completed | Success/failure with response |
| Retry Logic | Completed | 5 attempts, exponential backoff |
| Auto-Disable | Completed | After 50 consecutive failures |
| Test Endpoint | Completed | Send test payload |
| Retry Delivery | Completed | Manual retry for failed deliveries |
| Dashboard UI | Completed | Full management interface |

### Notifications

| Feature | Status | Notes |
|---------|--------|-------|
| In-App Notifications | Completed | Bell icon with unread count |
| Notification Types | Completed | 8 types (booking + team events) |
| Mark Read | Completed | Individual and bulk |
| Cursor Pagination | Completed | 20 per page |
| Email Notifications | Completed | 9 email template types |

### Analytics

| Feature | Status | Notes |
|---------|--------|-------|
| Total Metrics | Completed | Bookings, hours, guests |
| Bookings Over Time | Completed | 30-day bar chart |
| Popular Event Types | Completed | Top 5 horizontal bar |
| Booking Times | Completed | Hour-of-day distribution |
| Status Distribution | Completed | Pie chart |
| Lead Time Analysis | Completed | Advance booking breakdown |
| Day of Week | Completed | Busiest days |
| Repeat Guests | Completed | Return visitor analysis |
| Chart Customization | Completed | Toggle + localStorage |
| Feature Gate | Completed | TEAM plan only |

### Billing & Plans

| Feature | Status | Notes |
|---------|--------|-------|
| Plan Tiers | Completed | FREE, PRO ($12/mo), TEAM ($20/user/mo) |
| Server-Side Enforcement | Completed | Numeric + boolean limits |
| Client-Side Gating | Completed | Hook + badge + modal + page components |
| Usage Dashboard | Completed | Event types, calendars, webhooks bars |
| Dev Plan Switcher | Completed | Mock endpoint for testing |
| App-Managed Subscriptions | Completed | Stripe processes payments only — no Stripe subscriptions/webhooks |
| Subscription Lifecycle | Completed | State machine: NONE→ACTIVE→UNSUBSCRIBED→GRACE→LOCKED |
| Recurring Payments | Completed | Background job charges saved cards, 3 retries, grace period |
| Admin Subscription Mgmt | Completed | Upgrade, immediate/grace downgrade, cancel downgrade, preview |
| Admin Plan Management | Completed | CRUD plans with pricing and limits from admin panel |
| Admin Payment History | Completed | Paginated payments, full/partial refunds via Stripe |
| Resource Locking | Completed | Lock/unlock event types, webhooks, team events on plan change |
| Payment Emails | Completed | Invoice (success), failed payment, refund notification emails |
| Checkout Recovery | Completed | Auto-recover unprocessed Stripe payments (page mount + background) |

### Other Features

| Feature | Status | Notes |
|---------|--------|-------|
| PWA Support | Completed | Service worker + install banner |
| Mobile Responsive | Completed | Sidebar collapses on mobile |
| Landing Page | Completed | Hero + features + pricing + CTA |
| SEO | Completed | Meta tags + JSON-LD structured data |
| Contact Page | Completed | With API endpoint |
| Legal Pages | Completed | Privacy policy + terms |
| About Page | Completed | Company info |
| Embed Widget | Completed | Code generator for embedding |
| Public Profiles | Completed | User + team public pages |

---

## 5. Authentication & Authorization

### Auth Flow

```
OAuth (Google):
  Click Login → Google Redirect → Callback → Create/Link Account → JWT Cookie

Credentials:
  Email + Password → Zod Validate → bcrypt Verify → JWT Cookie

Signup:
  Validate → Check Existing → Hash Password → Create User →
  Generate Username → Default Schedule → Default Event → Verify Email
```

### Session Structure

```typescript
interface Session {
  user: {
    id: string;
    email: string;
    name?: string;
    image?: string;
    username?: string;
    timezone: string;
    plan: UserPlan;              // FREE | PRO | TEAM
    role: UserRole;              // USER | ADMIN
    onboardingCompleted: boolean;
    subscriptionStatus: string;  // NONE | ACTIVE | UNSUBSCRIBED | GRACE_PERIOD | DOWNGRADING | LOCKED
    planExpiresAt?: string;
    gracePeriodEndsAt?: string;
    cleanupScheduledAt?: string;
  }
}
```

### Route Protection (middleware.ts)

**Protected (require auth):**
- `/dashboard/*` - All dashboard pages
- `/api/availability/*`, `/api/event-types/*`, `/api/users/me`, `/api/webhooks/*`, `/api/teams/*`, `/api/calendars/*`

**Public:**
- `/` - Landing page
- `/auth/*` - Auth pages
- `/[username]/*` - Public booking pages
- `/team/*` - Public team pages
- `/api/auth/*`, `/api/slots`, `/api/bookings` (POST), `/api/public/*`

**Additional checks:**
- Unverified email → redirect to `/auth/verify-email-required`
- Onboarding incomplete → redirect to `/dashboard/onboarding`

### Team Roles

| Role | Permissions |
|------|------------|
| **OWNER** | Full team control, delete team, manage all |
| **ADMIN** | Manage settings, members, event types |
| **MEMBER** | View team, participate in scheduling |

---

## 6. Environment Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 16+
- Redis 7+ (optional, for job queue)

### Quick Start

```bash
git clone https://github.com/your-org/timetide-app.git
cd timetide-app
npm install
cp .env.example .env
docker-compose up -d          # Start PostgreSQL + Redis
npm run db:generate           # Generate Prisma client
npm run db:migrate            # Run migrations
npm run dev                   # Start dev server at http://localhost:3000
```

### Required Environment Variables

```env
DATABASE_URL="postgresql://user:password@localhost:5432/timetide?schema=public"
NEXTAUTH_SECRET="openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### Optional Environment Variables

```env
# Email
RESEND_API_KEY="re_your_api_key"
EMAIL_FROM="TimeTide <noreply@yourdomain.com>"

# Redis
REDIS_URL="redis://localhost:6379"

# Stripe (app manages subscriptions; Stripe only processes payments)
STRIPE_SECRET_KEY="sk_..."

# Zoom
ZOOM_CLIENT_ID="your-zoom-client-id"
ZOOM_CLIENT_SECRET="your-zoom-client-secret"

# Microsoft
MICROSOFT_CLIENT_ID="your-azure-app-id"
MICROSOFT_CLIENT_SECRET="your-azure-client-secret"
MICROSOFT_TENANT_ID="common"

# Admin
ADMIN_EMAILS="admin@yourdomain.com"
```

### Development Scripts

```bash
npm run dev            # Development server
npm run build          # Production build
npm run lint           # ESLint
npm run db:generate    # Generate Prisma client
npm run db:migrate     # Run migrations
npm run db:push        # Push schema (dev only)
npm run db:studio      # Prisma Studio GUI
npm run db:seed        # Seed database
npm run test           # Unit tests (Vitest)
npm run test:e2e       # E2E tests (Playwright)
```

### Docker Development

```bash
docker-compose up -d       # Start PostgreSQL + Redis
docker-compose down        # Stop
docker-compose down -v     # Stop + delete volumes
docker-compose logs -f     # View logs
```

---

## 7. Key Implementation Details

### Slot Calculation Safety Limits

```typescript
MAX_SLOTS_PER_DAY = 100;     // Prevents memory explosion
MAX_DAYS_TO_PROCESS = 90;    // Limits calculation scope
MIN_SLOT_INTERVAL = 5;       // Minimum 5 minutes between slots
```

### Double-Booking Prevention

Slot availability checks ALL host bookings across ALL event types, not just the current one. Calendar busy times are fetched in real-time. Final validation occurs at booking creation.

### Plan Limits Configuration

Defined in `src/lib/pricing.ts` as `PLAN_LIMITS` object. Two enforcement layers:
- **Server**: `checkNumericLimit()` and `checkFeatureAccess()` in API routes
- **Client**: `useFeatureGate()` hook with ProBadge, UpgradeModal, FeatureGatePage components

### Webhook Security

- HMAC-SHA256 signature in `X-Webhook-Signature` header
- Secret auto-generated (32 bytes hex) on webhook creation
- Signature format: `sha256=<hex_digest>`

### Background Jobs

BullMQ queues with Redis backend. Initialized in `src/instrumentation.ts`. Fallback to direct execution when Redis is unavailable.

### Prisma Client

Generated to `src/generated/prisma/` (configured in `prisma.config.ts`). Path alias: `@/generated/prisma`.

---

## 8. Known Issues & Technical Debt

### Performance

| Issue | Impact | Suggested Fix |
|-------|--------|---------------|
| Slot calculation on every request | Medium | Add Redis caching with TTL |
| Sequential calendar API calls | Medium | Parallelize multi-calendar fetches |
| Multiple analytics DB queries | Low | Consolidate into single aggregation |

### Security

| Issue | Risk | Status |
|-------|------|--------|
| In-memory rate limiting resets on restart | Low | Use Redis in production |
| OAuth tokens stored as plain text | Medium | Consider field-level encryption |

### Code Quality

| Area | Issue |
|------|-------|
| API Routes | Inconsistent error response formats |
| Types | Some API response types are inline rather than shared |
| Testing | Limited test coverage (slots + validation have tests) |
| Logging | Console-only, no structured logging |
| Monitoring | No health checks or APM |

---

## 9. Future Improvements

### High Priority

| Feature | Description |
|---------|-------------|
| **Structured Logging** | Replace console.log with LogTail/similar |
| **Health Checks** | Endpoint for infrastructure monitoring |
| **Test Coverage** | Expand unit and integration tests |

### Medium Priority

| Feature | Description |
|---------|-------------|
| **Apple Calendar** | CalDAV integration |
| **SMS Notifications** | Twilio integration |
| **Custom Domains** | User-specific booking domains |
| **i18n** | Internationalization support |
| **API Versioning** | `/api/v1/` prefix |

### Nice to Have

| Feature | Description |
|---------|-------------|
| **Mobile App** | React Native companion app |
| **White-Label Embedding** | Customizable embedded booking widget |
| **Analytics Export** | CSV/PDF report generation |
| **Waitlist** | Queue when slots are full |
| **2FA** | Two-factor authentication |
| **GDPR Tools** | Data export and deletion |

---

## Quick Reference: Key Files

| Purpose | File |
|---------|------|
| Auth config | `src/lib/auth.ts` |
| Route protection | `src/middleware.ts` |
| Database schema | `prisma/schema.prisma` |
| Slot calculation | `src/lib/scheduling/slots/calculator.ts` |
| Team slot calculation | `src/lib/scheduling/slots/team-calculator.ts` |
| Validation schemas | `src/lib/validation/schemas.ts` |
| Plan limits | `src/lib/pricing.ts` |
| Plan enforcement | `src/lib/plan-enforcement.ts` |
| Google Calendar | `src/lib/integrations/calendar/google.ts` |
| Outlook Calendar | `src/lib/integrations/calendar/outlook.ts` |
| Zoom integration | `src/lib/integrations/zoom/index.ts` |
| Email client | `src/lib/integrations/email/client.ts` |
| Queue system | `src/lib/infrastructure/queue/index.ts` |
| Recurring utils | `src/lib/scheduling/recurring/utils.ts` |
| Notifications | `src/lib/notifications.ts` |
| Stripe payment helpers | `src/lib/stripe.ts` |
| Plan config (server) | `src/lib/pricing-server.ts` |
| Subscription lifecycle | `src/lib/subscription-lifecycle.ts` |
| Subscription queue | `src/lib/infrastructure/queue/subscription-queue.ts` |
| Admin auth | `src/lib/admin-auth.ts` |
| Admin audit | `src/lib/admin-audit.ts` |

---

*Copyright (c) 2024 SeekaHost Technologies Ltd. All Rights Reserved.*

*Last updated: March 2026*
