# TimeTide - Development Documentation

> Modern scheduling that flows with your time

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture & Folder Structure](#3-architecture--folder-structure)
4. [Features](#4-features)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Environment Setup](#6-environment-setup)
7. [Known Issues & Technical Debt](#7-known-issues--technical-debt)
8. [Future Improvements & Roadmap](#8-future-improvements--roadmap)

---

## 1. Project Overview

### What is TimeTide?

TimeTide is a modern, self-hostable scheduling platform that enables users to share their availability and let others book time with them. Inspired by Cal.com and Calendly, TimeTide provides a streamlined booking experience with deep calendar integration, timezone intelligence, and a clean oceanic design aesthetic.

### What Problem Does It Solve?

- **Eliminates back-and-forth scheduling emails** - Instead of exchanging multiple messages to find a meeting time, users share a single booking link
- **Prevents double-booking** - Real-time integration with Google Calendar and Outlook prevents scheduling conflicts
- **Handles timezone complexity** - Automatic timezone detection and conversion ensures invitees see slots in their local time
- **Centralizes booking management** - All appointments, confirmations, and cancellations are managed in one dashboard

### Who Is It For?

| User Type | Use Case |
|-----------|----------|
| **Freelancers & Consultants** | Client consultations, discovery calls, project kick-offs |
| **Sales Teams** | Demo scheduling, prospect meetings, follow-ups |
| **Customer Support** | Technical support calls, onboarding sessions |
| **Educators & Coaches** | Tutoring sessions, mentorship calls, office hours |
| **Healthcare Providers** | Patient consultations (non-clinical) |
| **Recruiters** | Interview scheduling, candidate screenings |

### Core Use Cases

1. **Event Type Creation** - Define bookable meeting types (e.g., "30-min Discovery Call", "1-hour Consultation")
2. **Availability Sharing** - Set weekly working hours and share public booking pages
3. **Booking Management** - Receive, confirm, reschedule, or cancel appointments
4. **Calendar Synchronization** - Two-way sync with Google Calendar and Outlook
5. **Automated Notifications** - Email confirmations and reminders for all parties
6. **Video Conferencing** - Auto-generate Zoom, Google Meet, or Teams links

---

## 2. Tech Stack

### Frontend Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 14.1.0 | React framework with App Router |
| **React** | 18.2.0 | UI component library |
| **TypeScript** | 5.3.3 | Type-safe JavaScript |
| **Tailwind CSS** | 3.4.1 | Utility-first CSS framework |
| **Radix UI** | Various | Accessible UI primitives |
| **Lucide React** | 0.344.0 | Icon library |
| **React Hook Form** | 7.50.1 | Form state management |
| **React Query** | 5.24.0 | Server state management |
| **React Day Picker** | 8.10.0 | Calendar component |
| **Recharts** | 3.6.0 | Analytics charts |

### Backend Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js API Routes** | 14.1.0 | REST API endpoints |
| **NextAuth.js** | 4.24.6 | Authentication |
| **Prisma** | 5.10.0 | Database ORM |
| **Zod** | 3.22.4 | Runtime validation |
| **BullMQ** | 5.4.0 | Background job queue |
| **date-fns** | 3.3.1 | Date manipulation |
| **date-fns-tz** | 3.2.0 | Timezone handling |
| **bcryptjs** | 2.4.3 | Password hashing |
| **nanoid** | 5.0.5 | Unique ID generation |

### Database

| Technology | Purpose |
|------------|---------|
| **PostgreSQL 16** | Primary relational database |
| **Redis 7** | Job queue and caching (via ioredis 5.3.2) |

### Authentication

| Provider | Method |
|----------|--------|
| **Google OAuth** | Social login + Calendar access |
| **GitHub OAuth** | Social login |
| **Email/Password** | Credentials-based authentication |

### Third-Party Services

| Service | Purpose | Status |
|---------|---------|--------|
| **Resend** | Transactional emails | Implemented |
| **Google Calendar API** | Calendar sync + Google Meet | Implemented |
| **Microsoft Graph API** | Outlook/Teams integration | Implemented |
| **Zoom API** | Video meeting creation | Implemented |

### Hosting / Deployment

TimeTide supports multiple deployment options:

- **Vercel** - Recommended for ease of deployment
- **Self-hosted** - Docker Compose or traditional Node.js deployment
- **Database**: Supabase, Railway, Neon, or self-hosted PostgreSQL
- **Redis**: Upstash or self-hosted Redis

---

## 3. Architecture & Folder Structure

### Main Folder Structure

```
timetide-app/
├── prisma/
│   ├── schema.prisma           # Database schema (all models)
│   └── migrations/             # Migration history
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API routes
│   │   │   ├── auth/           # NextAuth endpoints
│   │   │   ├── availability/   # Availability CRUD
│   │   │   ├── bookings/       # Booking management
│   │   │   ├── calendars/      # Calendar OAuth callbacks
│   │   │   ├── event-types/    # Event type CRUD
│   │   │   ├── analytics/      # Analytics data
│   │   │   ├── slots/          # Available slot calculation
│   │   │   ├── teams/          # Team management
│   │   │   ├── users/          # User profile
│   │   │   └── zoom/           # Zoom integration
│   │   ├── auth/               # Auth pages (signin, signup)
│   │   ├── dashboard/          # Protected dashboard pages
│   │   │   ├── analytics/      # Analytics dashboard
│   │   │   ├── availability/   # Availability management
│   │   │   ├── bookings/       # Booking list & details
│   │   │   ├── event-types/    # Event type management
│   │   │   ├── onboarding/     # New user setup
│   │   │   ├── settings/       # User settings
│   │   │   └── teams/          # Team management
│   │   ├── [username]/         # Public booking pages
│   │   │   └── [slug]/         # Specific event booking
│   │   ├── bookings/           # Booking confirmation pages
│   │   ├── layout.tsx          # Root layout
│   │   └── page.tsx            # Landing page
│   ├── components/
│   │   ├── ui/                 # Shadcn/UI components
│   │   ├── booking/            # Booking flow components
│   │   ├── dashboard/          # Dashboard components
│   │   ├── availability/       # Availability editors
│   │   └── providers.tsx       # Context providers
│   ├── lib/
│   │   ├── auth.ts             # NextAuth configuration
│   │   ├── prisma.ts           # Prisma client singleton
│   │   ├── utils.ts            # Utility functions
│   │   ├── calendar/           # Calendar integrations
│   │   │   ├── google.ts       # Google Calendar API
│   │   │   └── outlook.ts      # Microsoft Graph API
│   │   ├── email/              # Email service
│   │   │   └── client.ts       # Resend integration
│   │   ├── slots/              # Slot calculation
│   │   │   └── calculator.ts   # Core scheduling algorithm
│   │   ├── zoom/               # Zoom integration
│   │   │   └── index.ts        # Zoom API wrapper
│   │   └── validation/         # Input validation
│   │       └── schemas.ts      # Zod schemas
│   ├── hooks/                  # React custom hooks
│   ├── types/                  # TypeScript definitions
│   └── middleware.ts           # Route protection
├── public/                     # Static assets
├── docs/                       # Documentation
├── docker-compose.yml          # Development containers
├── Dockerfile                  # Production image
└── package.json                # Dependencies
```

### App Flow: User Sign-In to Booking

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER JOURNEY                            │
└─────────────────────────────────────────────────────────────────┘

1. AUTHENTICATION
   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
   │   Landing    │────▶│   Sign In    │────▶│  Onboarding  │
   │    Page      │     │ (OAuth/Creds)│     │   (4 steps)  │
   └──────────────┘     └──────────────┘     └──────────────┘
                                                    │
                                                    ▼
2. SETUP                          ┌─────────────────────────────┐
   ┌──────────────┐               │   ONBOARDING STEPS:         │
   │   Dashboard  │◀──────────────│   1. Set timezone           │
   │    Home      │               │   2. Configure availability │
   └──────────────┘               │   3. Customize booking URL  │
         │                        │   4. Review event types     │
         ▼                        └─────────────────────────────┘
3. EVENT CREATION
   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
   │ Event Types  │────▶│  New Event   │────▶│   Settings   │
   │    List      │     │    Form      │     │ (Calendar/   │
   └──────────────┘     └──────────────┘     │    Zoom)     │
                                              └──────────────┘
4. SHARING
   User shares: https://timetide.app/username/event-slug
                              │
                              ▼
5. BOOKING FLOW (Public)
   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
   │   User's     │────▶│    Date      │────▶│   Booking    │
   │ Event Types  │     │   Picker     │     │     Form     │
   └──────────────┘     └──────────────┘     └──────────────┘
                              │                     │
                              │                     ▼
   ┌──────────────────────────┼──────────────────────────────┐
   │          SLOT CALCULATION ENGINE                        │
   │  - Fetch host's availability schedule                   │
   │  - Apply date overrides (holidays, etc.)                │
   │  - Fetch calendar busy times (Google/Outlook)           │
   │  - Exclude existing bookings                            │
   │  - Apply buffer times                                   │
   │  - Check minimum notice period                          │
   │  - Convert to invitee's timezone                        │
   └─────────────────────────────────────────────────────────┘
                              │
                              ▼
6. CONFIRMATION
   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
   │   Booking    │────▶│  Calendar    │────▶│    Email     │
   │   Created    │     │Event Created │     │    Sent      │
   └──────────────┘     └──────────────┘     └──────────────┘
```

### Key Design & Architectural Decisions

#### 1. Slot Calculation Safety
The slot calculator includes multiple safety mechanisms to prevent infinite loops and memory issues:
```typescript
const MAX_SLOTS_PER_DAY = 100;      // Prevents memory explosion
const MAX_DAYS_TO_PROCESS = 90;     // Limits calculation scope
const MIN_SLOT_INTERVAL = 5;        // Minimum 5 minutes between slots
const MIN_SLOT_DURATION = 5;        // Minimum slot length
```

#### 2. Double-Booking Prevention
- Slot availability is checked against ALL host bookings (not just one event type)
- Calendar busy times are fetched in real-time during slot calculation
- Final validation occurs at booking creation time

#### 3. Timezone Handling
- Host availability is stored in the host's timezone
- Slot calculations convert to UTC for comparison
- Results are converted to invitee's timezone for display
- All database timestamps are stored in UTC

#### 4. Authentication Strategy
- JWT-based sessions (30-day expiry) for scalability
- Prisma adapter for NextAuth persistence
- OAuth tokens stored in database for calendar access

#### 5. Rate Limiting
- Public endpoints (slots, bookings) are rate-limited per IP
- In-memory rate limiting for development, Redis-backed for production

---

## 4. Features

### Legend

| Symbol | Status |
|--------|--------|
| **Completed** | Fully implemented and production-ready |
| **Partially Implemented** | Core functionality works, missing some features |
| **Missing** | Not implemented, database schema may exist |
| **Needs Refactor** | Implemented but has issues requiring fixes |
| **Needs Improvement** | Works but could be enhanced |

---

### Authentication

| Feature | Status | Description | Notes |
|---------|--------|-------------|-------|
| Google OAuth | **Completed** | Sign in with Google account | Includes offline access for calendar |
| GitHub OAuth | **Completed** | Sign in with GitHub account | Basic profile info only |
| Email/Password | **Completed** | Traditional credentials auth | Password hashing with bcrypt |
| Session Management | **Completed** | JWT-based 30-day sessions | Automatic refresh via NextAuth |
| Auto-generated Username | **Completed** | Creates username from email on signup | Ensures uniqueness |
| Default Availability | **Completed** | Creates Mon-Fri 9-5 schedule on signup | Automatic setup |

---

### Event Type Management

| Feature | Status | Description | Notes |
|---------|--------|-------------|-------|
| Create Event Type | **Completed** | Define bookable meeting templates | Auto-generates unique slug |
| Edit Event Type | **Completed** | Modify all event settings | Full CRUD support |
| Delete Event Type | **Completed** | Remove event types | Cascades to related data |
| Duration Settings | **Completed** | Set meeting length (5-1440 minutes) | Validated min/max |
| Buffer Times | **Completed** | Before/after meeting gaps | Prevents back-to-back meetings |
| Minimum Notice | **Completed** | Required advance booking time | Up to 30 days |
| Booking Window | **Completed** | Rolling days, date range, or unlimited | Three period types |
| Location Types | **Completed** | In-person, phone, video, custom | 6 location options |
| Custom Questions | **Completed** | Add form fields to booking | 8 question types supported |
| Max Bookings/Day | **Completed** | Limit daily bookings | Per event type |
| Requires Confirmation | **Completed** | Host must approve bookings | PENDING → CONFIRMED flow |
| Success Redirect | **Completed** | Custom post-booking URL | Optional feature |

---

### Availability & Schedules

| Feature | Status | Description | Notes |
|---------|--------|-------------|-------|
| Weekly Schedule | **Completed** | Set hours for each day | Multiple time slots per day |
| Multiple Schedules | **Completed** | Named availability schedules | Assign to different event types |
| Default Schedule | **Completed** | One schedule marked as default | Automatically created on signup |
| Date Overrides | **Completed** | Custom hours for specific dates | Holidays, special hours |
| Day Off Override | **Completed** | Mark specific dates unavailable | `isWorking: false` |
| Timezone Support | **Completed** | Schedule stored in user's timezone | 40+ timezones available |
| Schedule Assignment | **Completed** | Link schedules to event types | Optional per event type |

---

### Public Booking Pages

| Feature | Status | Description | Notes |
|---------|--------|-------------|-------|
| User Profile Page | **Completed** | Lists all event types | `/username` |
| Event Booking Page | **Completed** | Calendar + time picker | `/username/slug` |
| Timezone Detection | **Completed** | Auto-detect invitee timezone | Browser-based detection |
| Timezone Selection | **Completed** | Manual timezone override | Dropdown selector |
| Slot Display | **Completed** | Shows available times | Grouped by date |
| Booking Form | **Completed** | Collect invitee details | Name, email, phone, notes |
| Custom Responses | **Completed** | Answer custom questions | JSON stored in booking |
| Confirmation Page | **Completed** | Post-booking details | `/bookings/[id]` |

---

### Calendar Integration

| Feature | Status | Description | Notes |
|---------|--------|-------------|-------|
| Google Calendar Connect | **Completed** | OAuth flow for Google | Full read/write access |
| Google Busy Times | **Completed** | Fetch calendar events | Prevents double-booking |
| Google Event Creation | **Completed** | Create events on booking | Includes all details |
| Google Meet Auto-Create | **Completed** | Generate Meet links | For GOOGLE_MEET location |
| Outlook Calendar Connect | **Completed** | OAuth via Microsoft Graph | Requires Azure app |
| Outlook Busy Times | **Completed** | Fetch Outlook events | Status-aware filtering |
| Outlook Event Creation | **Completed** | Create Outlook events | Includes attendees |
| Teams Auto-Create | **Completed** | Generate Teams links | For TEAMS location |
| Calendar Event Update | **Completed** | Update on reschedule | Syncs changes |
| Calendar Event Delete | **Completed** | Remove on cancellation | Keeps calendars clean |
| Token Refresh | **Completed** | Auto-refresh OAuth tokens | 5-minute early refresh |

---

### Video Conferencing

| Feature | Status | Description | Notes |
|---------|--------|-------------|-------|
| Zoom OAuth | **Completed** | Connect Zoom account | Full OAuth flow |
| Zoom Meeting Creation | **Completed** | Auto-create meetings | On booking confirmation |
| Zoom Meeting Update | **Completed** | Update meeting details | On reschedule |
| Zoom Meeting Delete | **Completed** | Delete on cancellation | Cleanup |
| Zoom Settings | **Completed** | Configure meeting options | Video, mute, recording |
| Google Meet | **Completed** | Auto-create via Calendar | No separate auth needed |
| Microsoft Teams | **Completed** | Auto-create via Graph | Requires Outlook connected |

---

### Notifications & Email

| Feature | Status | Description | Notes |
|---------|--------|-------------|-------|
| Booking Confirmation | **Completed** | Email to host + invitee | Styled HTML templates |
| Booking Cancellation | **Completed** | Notify both parties | Includes reason if provided |
| Booking Pending | **Completed** | For approval-required events | Asks host to confirm |
| Booking Confirmed | **Completed** | When host approves | Sent to invitee |
| Booking Rejected | **Completed** | When host declines | Sent to invitee |
| Reschedule Notice | **Completed** | On booking reschedule | New time details |
| Reminder Emails | **Partially Implemented** | Pre-meeting reminders | Template exists, needs scheduler |
| Email Templates | **Completed** | Professional HTML emails | Consistent branding |

**What's needed for Reminders:**
- Implement scheduled job in BullMQ worker
- Configure reminder intervals (24h, 1h before)
- Add user preference for reminder timing

---

### Dashboard & User Profile

| Feature | Status | Description | Notes |
|---------|--------|-------------|-------|
| Bookings Overview | **Completed** | List all bookings | Upcoming, past, cancelled |
| Booking Filters | **Completed** | Filter by status | Tabs for different views |
| Booking Details | **Completed** | View full booking info | Custom responses included |
| Confirm/Reject | **Completed** | Approve pending bookings | PATCH endpoint |
| Cancel Booking | **Completed** | Cancel with reason | Triggers notifications |
| Quick Stats | **Completed** | Booking counts | Cards on dashboard |
| Profile Settings | **Completed** | Edit name, username, bio | With validation |
| Timezone Settings | **Completed** | Select user timezone | 40+ options |
| Profile Picture | **Completed** | Display OAuth avatar | From Google/GitHub |
| Booking Link Display | **Completed** | Show shareable URL | Copy button |

---

### Analytics

| Feature | Status | Description | Notes |
|---------|--------|-------------|-------|
| Total Bookings | **Completed** | All-time count | API endpoint |
| Monthly Bookings | **Completed** | This month count | Trend tracking |
| Hours Booked | **Completed** | Total meeting time | Calculated from bookings |
| Unique Guests | **Completed** | Distinct invitee emails | Guest tracking |
| Cancellation Rate | **Completed** | Percentage cancelled | Performance metric |
| Bookings Over Time | **Completed** | 30-day trend chart | Line chart |
| Popular Event Types | **Completed** | Most booked events | Bar chart |
| Booking Times | **Completed** | Hour-of-day distribution | Bar chart |
| Status Distribution | **Completed** | Pie chart by status | Visual breakdown |
| Lead Time Analysis | **Completed** | Advance booking distribution | Bar chart |
| Day of Week | **Completed** | Busiest days | Bar chart |
| Repeat Guests | **Completed** | Return visitor analysis | Loyalty tracking |
| Chart Customization | **Completed** | Show/hide charts | Persisted to localStorage |

---

### Teams & Collaboration

| Feature | Status | Description | Notes |
|---------|--------|-------------|-------|
| Team Creation | **Partially Implemented** | Create team with slug | Backend API complete |
| Team Members | **Partially Implemented** | Add users by email | Backend API complete |
| Team Roles | **Partially Implemented** | OWNER, ADMIN, MEMBER | Database schema ready |
| Team Event Types | **Missing** | Shared event types | Schema exists, not wired |
| Round-Robin Scheduling | **Missing** | Rotate between members | Algorithm exists, not integrated |
| Collective Scheduling | **Missing** | All-member availability | Algorithm exists, not integrated |
| Team Dashboard | **Missing** | Shows "Coming Soon" | Placeholder UI only |
| Team Settings | **Missing** | Configure team options | Not implemented |

**What's needed for Teams:**
1. Build frontend UI for team creation
2. Wire team event types to booking flow
3. Implement round-robin assignment logic in booking creation
4. Add collective slot calculation to `/api/slots`
5. Create team booking pages (`/team/[slug]/[eventSlug]`)

---

### Webhooks

| Feature | Status | Description | Notes |
|---------|--------|-------------|-------|
| Webhook Model | **Missing** | Database schema exists | No implementation |
| Webhook CRUD | **Missing** | No API endpoints | Schema only |
| Event Triggers | **Missing** | No trigger logic | Defined in validation schema |
| Webhook Delivery | **Missing** | No delivery system | Needs implementation |
| Webhook Secrets | **Missing** | Signature verification | Planned |

**What's needed for Webhooks:**
1. Create `/api/webhooks` CRUD endpoints
2. Add webhook trigger points in booking flow
3. Implement webhook delivery with retry logic
4. Build webhook management UI in dashboard

---

### Onboarding

| Feature | Status | Description | Notes |
|---------|--------|-------------|-------|
| Timezone Setup | **Completed** | Step 1: Set timezone | Auto-detection |
| Availability Setup | **Completed** | Step 2: Configure hours | Visual editor |
| Booking Link Setup | **Completed** | Step 3: Customize username | Availability check |
| Event Type Review | **Completed** | Step 4: Review events | Edit link |
| Skip Option | **Completed** | Skip onboarding | Goes to dashboard |
| Progress Indicator | **Completed** | Visual step tracker | 4-step progress |

---

## 5. Authentication & Authorization

### How Authentication Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOW                          │
└─────────────────────────────────────────────────────────────────┘

OAuth Flow (Google/GitHub):
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Click   │────▶│ Redirect │────▶│ Provider │────▶│ Callback │
│  Login   │     │to Provider│     │  Login   │     │  /api/   │
└──────────┘     └──────────┘     └──────────┘     │ auth/cb  │
                                                    └────┬─────┘
                                                         │
                   ┌─────────────────────────────────────┘
                   ▼
           ┌──────────────┐
           │ Create/Link  │
           │   Account    │
           └──────┬───────┘
                  │
                  ▼
           ┌──────────────┐     ┌──────────────┐
           │  Generate    │────▶│   Session    │
           │  JWT Token   │     │   Cookie     │
           └──────────────┘     └──────────────┘

Credentials Flow:
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Enter   │────▶│ Validate │────▶│  Verify  │────▶│ Generate │
│  Email/  │     │  Input   │     │ Password │     │   JWT    │
│ Password │     │  (Zod)   │     │ (bcrypt) │     │          │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
```

### Session Structure

```typescript
interface Session {
  user: {
    id: string;          // Database user ID
    email: string;       // User email
    name?: string;       // Display name
    image?: string;      // Avatar URL
    username?: string;   // Booking URL username
    timezone: string;    // User's timezone
    bio?: string;        // Profile bio
  }
}
```

### User Roles and Access Control

| Role | Scope | Permissions |
|------|-------|-------------|
| **Authenticated User** | Own resources | Full CRUD on own event types, bookings, schedules |
| **Team Owner** | Team resources | Manage team, add/remove members, create team events |
| **Team Admin** | Team resources | Manage team settings, create team events |
| **Team Member** | Team resources | View team bookings, participate in scheduling |
| **Public** | Public pages | View booking pages, create bookings |

### Route Protection

Protected routes are enforced in `middleware.ts`:

```typescript
// Protected routes (require authentication)
/dashboard/*           // All dashboard pages
/api/event-types/*     // Event type management
/api/availability/*    // Availability management
/api/calendars/*       // Calendar connections
/api/users/me          // User profile

// Public routes
/                      // Landing page
/auth/*               // Sign in/up pages
/[username]/*         // Public booking pages
/api/auth/*           // Auth endpoints
/api/slots            // Available slot queries
/api/bookings (POST)  // Create bookings
```

### Security Considerations

| Area | Implementation |
|------|----------------|
| **Password Storage** | bcrypt with salt rounds (10) |
| **Session Tokens** | JWT with 30-day expiry |
| **CSRF Protection** | Built into NextAuth |
| **SQL Injection** | Prevented by Prisma ORM |
| **XSS Prevention** | React's default escaping |
| **Rate Limiting** | In-memory (dev) / Redis (prod) |
| **OAuth Tokens** | Stored encrypted in database |
| **Input Validation** | Zod schemas on all endpoints |

---

## 6. Environment Setup

### Prerequisites

- **Node.js** 18.0.0 or higher
- **PostgreSQL** 14 or higher
- **Redis** 6 or higher (optional, for job queue)
- **npm** or **yarn**

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/timetide-app.git
cd timetide-app

# 2. Install dependencies
npm install

# 3. Copy environment file
cp .env.example .env.local

# 4. Configure environment variables (see below)
# Edit .env.local with your values

# 5. Start development services (PostgreSQL + Redis)
docker-compose up -d

# 6. Initialize database
npm run db:generate
npm run db:migrate

# 7. Start development server
npm run dev

# 8. Open http://localhost:3000
```

### Required Environment Variables

```env
# ===================
# Database (Required)
# ===================
DATABASE_URL="postgresql://user:password@localhost:5432/timetide?schema=public"

# ===================
# NextAuth.js (Required)
# ===================
# Generate with: openssl rand -base64 32
NEXTAUTH_SECRET="your-32-character-or-longer-secret"
NEXTAUTH_URL="http://localhost:3000"

# ===================
# Google OAuth (Required for Google login)
# ===================
# Get from: https://console.cloud.google.com/apis/credentials
GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# ===================
# App Configuration (Required)
# ===================
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="TimeTide"
NODE_ENV="development"
```

### Optional Environment Variables

```env
# ===================
# GitHub OAuth (Optional)
# ===================
# Get from: https://github.com/settings/developers
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"

# ===================
# Email Service (Optional but recommended)
# ===================
# Get from: https://resend.com/api-keys
RESEND_API_KEY="re_your_api_key"
EMAIL_FROM="TimeTide <noreply@yourdomain.com>"

# ===================
# Redis for Job Queue (Optional)
# ===================
REDIS_URL="redis://localhost:6379"

# ===================
# Zoom Integration (Optional)
# ===================
# Get from: https://marketplace.zoom.us/develop/create
ZOOM_CLIENT_ID="your-zoom-client-id"
ZOOM_CLIENT_SECRET="your-zoom-client-secret"

# ===================
# Microsoft Outlook/Teams (Optional)
# ===================
# Get from: https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps
MICROSOFT_CLIENT_ID="your-azure-app-id"
MICROSOFT_CLIENT_SECRET="your-azure-client-secret"
MICROSOFT_TENANT_ID="common"
```

### Development Scripts

```bash
# Development server
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint

# Database commands
npm run db:generate    # Generate Prisma client
npm run db:migrate     # Run migrations
npm run db:push        # Push schema changes (dev only)
npm run db:studio      # Open Prisma Studio GUI
npm run db:seed        # Seed database

# Testing
npm run test           # Unit tests (Vitest)
npm run test:e2e       # E2E tests (Playwright)

# Production build
npm run build
npm start
```

### Docker Development Setup

The `docker-compose.yml` provides PostgreSQL and Redis:

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# Reset database
docker-compose down -v
docker-compose up -d
```

---

## 7. Known Issues & Technical Debt

### Bugs

| Issue | Severity | Location | Description |
|-------|----------|----------|-------------|
| Console logging in production | Low | `src/lib/slots/calculator.ts` | Debug logs should be removed or gated |
| Login page reference | Low | `src/lib/auth.ts` | References `/login` but page is at `/auth/signin` |

### Performance Issues

| Issue | Impact | Description | Suggested Fix |
|-------|--------|-------------|---------------|
| Slot calculation | Medium | Calculates all slots on every request | Add Redis caching with TTL |
| Calendar API calls | Medium | Sequential fetches for multiple calendars | Parallelize API calls |
| Analytics queries | Low | Multiple database queries per request | Consolidate into single aggregation |

### Security Concerns

| Issue | Risk | Description | Status |
|-------|------|-------------|--------|
| Rate limit bypass | Low | In-memory rate limiting resets on restart | Use Redis in production |
| Token encryption | Medium | OAuth tokens stored as plain text | Consider field-level encryption |
| Webhook secrets | Low | No signature verification | Not implemented yet |

### Code Smells & Technical Debt

| Area | Issue | Description |
|------|-------|-------------|
| **API Routes** | Inconsistent error handling | Some routes return different error formats |
| **Types** | Incomplete type exports | Some API response types are inline |
| **Tests** | Missing test coverage | No visible test files in repository |
| **Hooks folder** | Empty directory | Planned but not implemented |
| **Email failures** | Fire-and-forget | Email errors logged but not retried |
| **Calendar sync** | No background sync | Only fetches on demand |

### Areas Needing Attention

1. **Test Coverage** - Add unit tests for slot calculator, integration tests for API
2. **Error Boundaries** - Add React error boundaries for graceful failures
3. **Loading States** - Some pages lack proper loading indicators
4. **Accessibility** - Audit for WCAG compliance
5. **i18n** - No internationalization support

---

## 8. Future Improvements & Roadmap

### Suggested Features

#### High Priority

| Feature | Description | Effort |
|---------|-------------|--------|
| **Reminder System** | Scheduled email reminders before meetings | Medium |
| **Team UI** | Complete team management dashboard | High |
| **Webhooks** | External integrations for booking events | Medium |
| **Calendar Sync Jobs** | Background calendar refresh | Medium |

#### Medium Priority

| Feature | Description | Effort |
|---------|-------------|--------|
| **Payments Integration** | Stripe for paid bookings | High |
| **Recurring Events** | Weekly/monthly recurring bookings | High |
| **Buffer between events** | Global buffer settings | Low |
| **Booking reschedule** | Self-service reschedule UI | Medium |
| **SMS Notifications** | Twilio integration | Medium |
| **Apple Calendar** | CalDAV integration | High |

#### Nice to Have

| Feature | Description | Effort |
|---------|-------------|--------|
| **Mobile App** | React Native app | Very High |
| **White-label** | Embeddable booking widget | High |
| **Custom Domains** | User-specific domains | Medium |
| **Group Bookings** | Multiple invitees per slot | Medium |
| **Waitlist** | When slots are full | Low |
| **Analytics Export** | CSV/PDF reports | Low |

### Architectural Improvements

| Area | Current State | Improvement |
|------|---------------|-------------|
| **Caching** | None | Add Redis caching for slots and availability |
| **Job Queue** | BullMQ ready, not used | Implement workers for emails and reminders |
| **API Versioning** | None | Add `/api/v1/` prefix for future changes |
| **Logging** | Console only | Structured logging with service like LogTail |
| **Monitoring** | None | Add health checks and APM (e.g., Sentry) |
| **CDN** | Vercel default | Consider dedicated CDN for assets |

### Performance & Scalability

| Area | Suggestion |
|------|------------|
| **Database** | Add connection pooling (PgBouncer) |
| **Queries** | Implement database query caching |
| **Static Pages** | Enable ISR for public booking pages |
| **API** | Add response compression |
| **Images** | Optimize with next/image and CDN |
| **Bundles** | Analyze and code-split large dependencies |

### Security Enhancements

| Enhancement | Description |
|-------------|-------------|
| **2FA** | Two-factor authentication |
| **Audit Logs** | Track sensitive actions |
| **Token Encryption** | Encrypt OAuth tokens at rest |
| **CSP Headers** | Content Security Policy |
| **Dependency Scanning** | Automated vulnerability checks |
| **GDPR Compliance** | Data export and deletion tools |

---

## Quick Reference

### Key Files

| Purpose | File |
|---------|------|
| Auth config | `src/lib/auth.ts` |
| Route protection | `src/middleware.ts` |
| Database schema | `prisma/schema.prisma` |
| Slot calculation | `src/lib/slots/calculator.ts` |
| Validation schemas | `src/lib/validation/schemas.ts` |
| Google Calendar | `src/lib/calendar/google.ts` |
| Outlook Calendar | `src/lib/calendar/outlook.ts` |
| Zoom integration | `src/lib/zoom/index.ts` |
| Email client | `src/lib/email/client.ts` |

### API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/*` | Various | No | NextAuth handlers |
| `/api/slots` | GET | No | Get available slots |
| `/api/bookings` | GET | Yes | List user's bookings |
| `/api/bookings` | POST | No | Create booking (rate limited) |
| `/api/bookings/[id]` | PATCH | Yes | Confirm/reject booking |
| `/api/bookings/[id]` | DELETE | Yes | Cancel booking |
| `/api/event-types` | GET/POST | Yes | List/create event types |
| `/api/event-types/[id]` | GET/PATCH/DELETE | Yes | Event type CRUD |
| `/api/availability` | GET/POST | Yes | List/create schedules |
| `/api/availability/[id]` | GET/PUT/DELETE | Yes | Schedule CRUD |
| `/api/analytics` | GET | Yes | Get analytics data |
| `/api/calendars` | GET/POST/DELETE | Yes | Calendar management |
| `/api/zoom/*` | Various | Yes | Zoom integration |
| `/api/teams` | GET/POST | Yes | Team management |
| `/api/users/me` | GET/PATCH | Yes | User profile |
| `/api/users/check-username` | GET | No | Username availability |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

Copyright (c) 2024 SeekaHost Technologies Ltd. All Rights Reserved.

---

*Last updated: January 2026*
*Document version: 1.0.0*
