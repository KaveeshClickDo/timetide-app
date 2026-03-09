# <img src="public/logo.svg" width="28" height="28" alt="TimeTide" /> TimeTide.app

**Modern scheduling that flows with your time.**

TimeTide is a full-featured, self-hostable scheduling platform that helps professionals and teams manage their availability and bookings effortlessly. Built with Next.js 14, TypeScript, and a calm oceanic design aesthetic.

![TimeTide Banner](./public/og-image.png)

## Features

### Core Scheduling
- **Event Types** - Create custom meeting types with durations, buffers, custom questions, booking limits, and confirmation workflows
- **Smart Availability** - Weekly schedules with date overrides, multiple named schedules, timezone-aware with auto-detection
- **Public Booking Links** - Share `timetide.app/username/event-slug` links for self-service booking
- **Recurring Bookings** - Weekly, biweekly, monthly, and custom frequency recurring meetings (up to 24 occurrences)
- **Group Bookings** - Multi-seat events with capacity tracking
- **Rescheduling** - Guest-initiated and host-initiated rescheduling with email notifications

### Calendar & Video Integration
- **Google Calendar** - Two-way sync, busy time detection, automatic Google Meet link generation
- **Microsoft Outlook** - Full calendar sync via Microsoft Graph API with Teams meeting support
- **Zoom** - OAuth-based integration with automatic meeting creation, update, and deletion
- **Multi-Calendar Support** - Connect multiple calendars per provider for conflict checking
- **Double-Booking Prevention** - Real-time availability checking across all connected calendars and all event types

### Team Scheduling
- **Team Management** - Create teams with OWNER, ADMIN, MEMBER roles
- **Round-Robin** - Distribute meetings across team members with rotation tracking
- **Collective Availability** - Find times when all required team members are free
- **Managed Scheduling** - Host assigns team member after booking
- **Team Event Types** - Create and manage event types at the team level with member assignments
- **Team Booking Pages** - Public team pages at `/team/[slug]/[event-slug]`
- **Team Invitations** - Email-based team invitations with accept/decline flow
- **Audit Logging** - Track all team actions with full audit trail

### Notifications & Webhooks
- **Email Notifications** - Confirmations, cancellations, reschedule notices, reminders, pending approval alerts
- **In-App Notifications** - Real-time notification bell with unread count and type-based icons
- **Webhooks** - CRUD management with HMAC-SHA256 signatures, delivery tracking, retry logic, and auto-disable after failures
- **Background Jobs** - BullMQ-powered queues for emails, calendar sync, webhook delivery, and reminders

### Admin Panel
- **Dashboard** - Platform-wide statistics with stat cards
- **User Management** - View, edit, and manage all users with role control
- **Booking Management** - View and manage all bookings across the platform
- **Team Oversight** - Manage all teams and their members
- **Support Tickets** - Full ticketing system with threaded messages
- **Platform Analytics** - System-wide analytics and usage metrics
- **System Health** - Monitor system status and webhook deliveries
- **Audit Log** - Track all admin actions with timestamps
- **User Impersonation** - JWT-based impersonation for debugging user issues

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
- **Session Management** - Idle timeout detection with session expiry warnings
- **Embed Support** - Generate embed codes for booking widgets

## Architecture

```
+------------------------------------------------------------------+
|                          TimeTide.app                             |
+------------------------------------------------------------------+
|  Next.js 14 (App Router) + TypeScript + React 18                 |
+------------+-------------+-------------+-------------------------+
| Public     | Dashboard   | Admin Panel | API Routes              |
| - Landing  | - Bookings  | - Users     | - /api/bookings         |
| - Booking  | - Events    | - Bookings  | - /api/slots            |
| - Teams    | - Avail.    | - Teams     | - /api/calendars        |
| - Profiles | - Teams     | - Tickets   | - /api/teams            |
| - About    | - Analytics | - Analytics | - /api/webhooks         |
| - Contact  | - Webhooks  | - System    | - /api/analytics        |
|            | - Billing   | - Audit Log | - /api/notifications    |
|            | - Settings  |             | - /api/admin/*          |
|            | - Support   |             | - /api/tickets/*        |
+------------+-------------+-------------+-------------------------+
|                      Service Layer                               |
|   SlotCalculator  |  TeamCalculator  |  PlanEnforcement          |
|   CalendarSync    |  Notifications   |  Validation (Zod)        |
+------------------------------------------------------------------+
|                    Background Jobs (BullMQ)                       |
|   EmailQueue  |  WebhookQueue  |  CalendarSyncQueue  |  Reminders|
+------------------------------------------------------------------+
|                    Data Layer (Prisma ORM)                        |
|   PostgreSQL: Users, EventTypes, Bookings, Teams, Calendars,     |
|       Webhooks, Notifications, SupportTickets, AuditLogs         |
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
| **Charts** | Recharts 3 |
| **Image Processing** | Sharp |
| **Testing** | Vitest (unit), Playwright (E2E) |
| **Deployment** | Docker Compose, Vercel, or self-hosted |

## Quick Start

### Prerequisites
- Node.js 20+
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
│   ├── schema.prisma              # Database schema
│   ├── seed.ts                    # Database seeder
│   └── migrations/                # 17 migration files
├── src/
│   ├── app/
│   │   ├── api/                   # 80+ API route handlers
│   │   ├── admin/                 # Admin panel (users, bookings, teams, tickets, analytics, system, audit)
│   │   ├── auth/                  # Sign in/up, password reset, email verification
│   │   ├── dashboard/             # Protected pages (bookings, events, teams, analytics, settings, support)
│   │   ├── bookings/              # Public booking detail & reschedule
│   │   ├── team/                  # Public team booking pages
│   │   ├── [username]/            # Public user booking pages
│   │   ├── layout.tsx             # Root layout (SEO, PWA, providers)
│   │   └── page.tsx               # Marketing landing page
│   ├── components/
│   │   ├── ui/                    # 17 Shadcn/UI components
│   │   ├── admin/                 # Admin components (data-table, stat-card, page-header)
│   │   ├── booking/               # Booking + team booking widgets
│   │   └── *.tsx                  # Feature components (pricing, notifications, embed, etc.)
│   ├── hooks/                     # useFeatureGate, useNotifications, useIntegrationStatus, useIdleTimeout
│   ├── lib/
│   │   ├── auth.ts                # NextAuth config (JWT, providers, callbacks)
│   │   ├── prisma.ts              # Prisma client singleton
│   │   ├── pricing.ts             # Plan tiers, limits, helpers
│   │   ├── plan-enforcement.ts    # Server-side feature gating
│   │   ├── notifications.ts       # Notification helpers
│   │   ├── admin-auth.ts          # Admin authentication utilities
│   │   ├── admin-audit.ts         # Admin audit logging
│   │   ├── team-audit.ts          # Team audit logging
│   │   ├── integrations/
│   │   │   ├── calendar/          # Google + Outlook calendar integrations
│   │   │   ├── email/             # Resend email templates
│   │   │   └── zoom/              # Zoom API integration
│   │   ├── scheduling/
│   │   │   ├── slots/             # Slot + team slot calculators
│   │   │   └── recurring/         # Recurring booking utilities
│   │   ├── infrastructure/
│   │   │   └── queue/             # BullMQ queues (email, webhook, calendar, reminder)
│   │   └── validation/            # Zod schemas
│   ├── types/                     # Centralized TypeScript types (domain-organized)
│   ├── middleware.ts              # Route protection, email verification, onboarding, admin auth
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
npm run type-check     # TypeScript type checking
npm run db:generate    # Generate Prisma client
npm run db:migrate     # Run database migrations
npm run db:push        # Push schema changes (dev only)
npm run db:studio      # Prisma Studio GUI
npm run db:seed        # Seed database
npm run test           # Unit tests (Vitest)
npm run test:e2e       # E2E tests (Playwright)
npm run pwa:icons      # Generate PWA icons
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

Copyright (c) 2024-2026 SeekaHost Technologies Ltd. All Rights Reserved.

---

Built with <img src="public/logo.svg" width="16" height="16" alt="TimeTide" /> by the TimeTide team
