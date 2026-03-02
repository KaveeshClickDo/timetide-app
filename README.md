# <img src="public/logo.svg" width="28" height="28" alt="TimeTide" /> TimeTide.app

**Modern scheduling that flows with your time.**

TimeTide is a full-featured, self-hostable scheduling platform that helps professionals and teams manage their availability and bookings effortlessly. Built with Next.js 14, TypeScript, and a calm oceanic design aesthetic.

![TimeTide Banner](./public/og-image.png)

## Features

### Core Scheduling
- **Event Types** - Create custom meeting types with durations, buffers, custom questions, booking limits, and confirmation workflows
- **Smart Availability** - Weekly schedules with date overrides, multiple named schedules, timezone-aware
- **Public Booking Links** - Share `timetide.app/username/event-slug` links for self-service booking
- **Recurring Bookings** - Weekly, biweekly, monthly, and custom frequency recurring meetings (up to 24 occurrences)
- **Group Bookings** - Multi-seat events with capacity tracking

### Calendar & Video Integration
- **Google Calendar** - Two-way sync, busy time detection, automatic Google Meet link generation
- **Microsoft Outlook** - Full calendar sync via Microsoft Graph API with Teams meeting support
- **Zoom** - OAuth-based integration with automatic meeting creation, update, and deletion
- **Double-Booking Prevention** - Real-time availability checking across all connected calendars and all event types

### Team Scheduling
- **Team Management** - Create teams with OWNER, ADMIN, MEMBER roles
- **Round-Robin** - Distribute meetings across team members with rotation tracking
- **Collective Availability** - Find times when all required team members are free
- **Managed Scheduling** - Host assigns team member after booking
- **Team Booking Pages** - Public team pages at `/team/[slug]/[event-slug]`
- **Team Invitations** - Email-based team invitations with accept/decline flow
- **Audit Logging** - Track all team actions with full audit trail

### Notifications & Webhooks
- **Email Notifications** - Confirmations, cancellations, reschedule notices, reminders, pending approval alerts
- **In-App Notifications** - Real-time notification bell with unread count and type-based icons
- **Webhooks** - CRUD management with HMAC-SHA256 signatures, delivery tracking, retry logic, and auto-disable after failures
- **Background Jobs** - BullMQ-powered queues for emails, calendar sync, webhook delivery, and reminders

### Analytics (Team Plan)
- **Dashboard Metrics** - Total bookings, monthly count, hours booked, unique guests
- **7 Customizable Charts** - Bookings over time, popular event types, booking hours distribution, status breakdown, lead time, day-of-week, repeat guests
- **Chart Visibility** - Toggle charts on/off with localStorage persistence

### Plan & Billing
- **Three Tiers** - FREE, PRO ($12/mo), TEAM ($20/user/mo)
- **Feature Gating** - Server + client-side enforcement with upgrade prompts
- **Usage Tracking** - Event types, calendars, webhooks usage bars
- **Dev Plan Switcher** - Mock plan switching for development testing

### User Experience
- **5-Step Onboarding** - Timezone, availability, booking link, event types, integrations
- **PWA Support** - Progressive Web App with install banner and service worker
- **Responsive Design** - Full mobile support with sidebar navigation
- **Ocean Theme** - Custom color palette (ocean, tide, coral, sand) with Plus Jakarta Sans + Inter typography

## Architecture

```
+------------------------------------------------------------------+
|                          TimeTide.app                             |
+------------------------------------------------------------------+
|  Next.js 14 (App Router) + TypeScript + React 18                 |
+-------------------+-------------------+--------------------------+
|   Public Pages    |    Dashboard      |     API Routes           |
|   - Landing       |    - Bookings     |     - /api/bookings      |
|   - Booking Flow  |    - Event Types  |     - /api/slots         |
|   - Team Pages    |    - Availability |     - /api/calendars     |
|   - User Profiles |    - Teams        |     - /api/teams         |
|                   |    - Analytics    |     - /api/webhooks      |
|                   |    - Webhooks     |     - /api/analytics     |
|                   |    - Billing      |     - /api/notifications |
+-------------------+-------------------+--------------------------+
|                      Service Layer                               |
|   SlotCalculator  |  TeamCalculator  |  PlanEnforcement          |
|   CalendarSync    |  Notifications   |  Validation (Zod)        |
+------------------------------------------------------------------+
|                    Background Jobs (BullMQ)                       |
|   EmailQueue  |  WebhookQueue  |  CalendarSyncQueue  |  Reminders|
+------------------------------------------------------------------+
|                    Data Layer (Prisma ORM)                        |
|   PostgreSQL: Users, EventTypes, Bookings, Teams, Calendars,     |
|               Webhooks, Notifications, Analytics                  |
+------------------------------------------------------------------+
|                    External Services                             |
|   Google Calendar  |  Outlook/Graph  |  Zoom  |  Resend (Email) |
+------------------------------------------------------------------+
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 14.1 (App Router) |
| **Language** | TypeScript 5.3 |
| **UI** | React 18, Tailwind CSS 3.4, Shadcn/UI (Radix), Lucide Icons |
| **State** | React Query v5 (server), React Hook Form + Zod (forms) |
| **Auth** | NextAuth v4 (JWT, Google OAuth, Credentials) |
| **Database** | PostgreSQL 16 via Prisma ORM v7.3 |
| **Cache/Queue** | Redis 7 via ioredis, BullMQ 5.4 |
| **Email** | Resend API |
| **Charts** | Recharts |
| **Testing** | Vitest (unit), Playwright (E2E) |
| **Deployment** | Docker Compose, Vercel, or self-hosted |

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 16+
- Redis 7+ (for background jobs)

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/timetide-app.git
cd timetide-app
npm install
```

### 2. Environment Setup

```bash
cp .env.example .env
```

Edit `.env` with your credentials (see [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) for full variable reference).

### 3. Start Services (Docker)

```bash
docker-compose up -d
```

This starts PostgreSQL and Redis.

### 4. Database Setup

```bash
npm run db:generate    # Generate Prisma client
npm run db:migrate     # Run migrations
npm run db:seed        # (Optional) Seed demo data
```

### 5. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:3000`

## Project Structure

```
timetide-app/
├── prisma/
│   ├── schema.prisma              # Database schema (700+ lines)
│   └── migrations/                # 12 migration files
├── src/
│   ├── app/
│   │   ├── api/                   # 50+ API route handlers
│   │   ├── auth/                  # Sign in/up, password reset, email verification
│   │   ├── dashboard/             # Protected pages (bookings, events, teams, etc.)
│   │   ├── bookings/              # Public booking detail & reschedule
│   │   ├── team/                  # Public team booking pages
│   │   ├── [username]/            # Public user booking pages
│   │   ├── layout.tsx             # Root layout (SEO, PWA, providers)
│   │   └── page.tsx               # Marketing landing page
│   ├── components/
│   │   ├── ui/                    # 18 Shadcn/UI components
│   │   ├── booking/               # Booking + team booking widgets
│   │   └── *.tsx                  # Feature components (pricing, notifications, etc.)
│   ├── hooks/                     # useFeatureGate, useNotifications, useIntegrationStatus
│   ├── lib/
│   │   ├── auth.ts                # NextAuth config (JWT, providers, callbacks)
│   │   ├── prisma.ts              # Prisma client singleton
│   │   ├── pricing.ts             # Plan tiers, limits, helpers
│   │   ├── plan-enforcement.ts    # Server-side feature gating
│   │   ├── calendar/              # Google + Outlook integrations
│   │   ├── email/                 # Resend email templates
│   │   ├── slots/                 # Slot + team slot calculators
│   │   ├── queue/                 # BullMQ queues (email, webhook, calendar, reminder)
│   │   ├── recurring/             # Recurring booking utilities
│   │   ├── validation/            # Zod schemas (23 schemas, 23 types)
│   │   └── zoom/                  # Zoom API integration
│   ├── middleware.ts              # Route protection, email verification, onboarding redirect
│   └── globals.css                # Tailwind + custom styles
├── docs/
│   ├── DEVELOPMENT.md             # Development guide
│   ├── DEPLOYMENT.md              # Self-hosted deployment guide
│   ├── API.md                     # API reference
│   └── DATABASE.md                # Database schema documentation
├── docker-compose.yml             # PostgreSQL + Redis + App
├── Dockerfile.dev                 # Development container
└── vitest.config.ts               # Test configuration
```

## Scripts

```bash
npm run dev            # Development server
npm run build          # Production build
npm run start          # Production server
npm run lint           # ESLint
npm run db:generate    # Generate Prisma client
npm run db:migrate     # Run database migrations
npm run db:push        # Push schema changes (dev only)
npm run db:studio      # Prisma Studio GUI
npm run db:seed        # Seed database
npm run test           # Unit tests (Vitest)
npm run test:e2e       # E2E tests (Playwright)
```

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, design decisions, data flow |
| [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) | Development setup, environment variables, feature status |
| [docs/API.md](./docs/API.md) | Complete API endpoint reference |
| [docs/DATABASE.md](./docs/DATABASE.md) | Database schema, models, enums, relationships |
| [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) | Self-hosted deployment guide (Debian/Ubuntu) |

## Brand

| Element | Value |
|---------|-------|
| **Primary Color** | Ocean Deep `#0c4a6e` |
| **Accent** | Tide Blue `#0ea5e9` |
| **Heading Font** | Plus Jakarta Sans |
| **Body Font** | Inter |
| **Design** | Calm, professional, oceanic metaphors, generous whitespace |

## License

Copyright (c) 2024 SeekaHost Technologies Ltd. All Rights Reserved.

---

Built with <img src="public/logo.svg" width="16" height="16" alt="TimeTide" /> by the TimeTide team
