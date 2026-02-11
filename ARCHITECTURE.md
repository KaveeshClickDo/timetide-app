# TimeTide.app - Architecture Documentation

## <img src="public/logo.svg" width="20" height="20" alt="TimeTide" /> Overview

TimeTide.app is a modern scheduling platform that allows users to share their availability and let others book time with them. Built with Next.js 14 (App Router), TypeScript, and a calm oceanic design aesthetic.

## 📁 Project Structure

```
timetide-app/
├── prisma/
│   └── schema.prisma           # Database schema
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── signup/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── event-types/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── availability/page.tsx
│   │   │   ├── bookings/page.tsx
│   │   │   ├── calendars/page.tsx
│   │   │   └── team/
│   │   │       ├── page.tsx
│   │   │       └── [teamId]/page.tsx
│   │   ├── (public)/
│   │   │   └── [username]/
│   │   │       ├── page.tsx           # User's booking page
│   │   │       └── [eventSlug]/
│   │   │           ├── page.tsx       # Slot selection
│   │   │           └── book/page.tsx  # Booking form
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── availability/route.ts
│   │   │   ├── bookings/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts
│   │   │   │       ├── cancel/route.ts
│   │   │   │       └── reschedule/route.ts
│   │   │   ├── event-types/route.ts
│   │   │   ├── slots/route.ts
│   │   │   ├── calendars/
│   │   │   │   ├── google/callback/route.ts
│   │   │   │   └── outlook/callback/route.ts
│   │   │   ├── teams/route.ts
│   │   │   └── webhooks/route.ts
│   │   ├── layout.tsx
│   │   └── page.tsx                   # Landing page
│   ├── components/
│   │   ├── ui/                        # shadcn/ui components
│   │   ├── booking/
│   │   │   ├── calendar-picker.tsx
│   │   │   ├── time-slot-picker.tsx
│   │   │   ├── booking-form.tsx
│   │   │   └── booking-confirmation.tsx
│   │   ├── dashboard/
│   │   │   ├── sidebar.tsx
│   │   │   ├── event-type-card.tsx
│   │   │   └── booking-list.tsx
│   │   ├── availability/
│   │   │   ├── weekly-schedule.tsx
│   │   │   └── date-overrides.tsx
│   │   └── landing/
│   │       ├── hero.tsx
│   │       ├── features.tsx
│   │       └── pricing.tsx
│   ├── lib/
│   │   ├── auth.ts                    # NextAuth config
│   │   ├── prisma.ts                  # Prisma client
│   │   ├── slots/
│   │   │   ├── calculator.ts          # Slot calculation engine
│   │   │   ├── timezone.ts            # Timezone utilities
│   │   │   └── availability.ts        # Availability merging
│   │   ├── calendar/
│   │   │   ├── google.ts              # Google Calendar integration
│   │   │   ├── outlook.ts             # Microsoft Graph (stub)
│   │   │   └── types.ts
│   │   ├── email/
│   │   │   ├── client.ts              # Email client (Resend)
│   │   │   └── templates/
│   │   │       ├── booking-confirmed.tsx
│   │   │       ├── booking-cancelled.tsx
│   │   │       └── booking-reminder.tsx
│   │   ├── queue/
│   │   │   ├── client.ts              # BullMQ setup
│   │   │   └── workers/
│   │   │       ├── email.ts
│   │   │       └── calendar-sync.ts
│   │   ├── validation/
│   │   │   └── schemas.ts             # Zod schemas
│   │   └── utils.ts
│   ├── hooks/
│   │   ├── use-availability.ts
│   │   ├── use-bookings.ts
│   │   └── use-timezone.ts
│   └── types/
│       └── index.ts
├── public/
│   └── logo.svg
├── .env.example
├── package.json
├── tailwind.config.ts
├── next.config.js
└── README.md
```

## 🗄️ Data Model Overview

### Core Entities

1. **User** - Authenticated users who can create event types and receive bookings
2. **Account** - OAuth accounts (Google, Microsoft) linked to users
3. **Calendar** - Connected calendars for availability checking
4. **EventType** - Bookable event templates (e.g., "30-min meeting")
5. **AvailabilitySchedule** - Weekly availability patterns
6. **DateOverride** - Specific date availability overrides
7. **Booking** - Confirmed appointments
8. **Team** - Groups of users for team scheduling
9. **TeamMember** - User membership in teams with roles
10. **Webhook** - External integrations for booking events

### Key Relationships

```
User
├── EventTypes (1:N)
├── AvailabilitySchedules (1:N)
├── Calendars (1:N)
├── Bookings (as host, 1:N)
└── TeamMembers (1:N)

EventType
├── AvailabilitySchedule (N:1)
├── Bookings (1:N)
├── Questions (1:N embedded)
└── Team (optional, N:1)

Team
├── TeamMembers (1:N)
└── EventTypes (1:N)
```

## 🎯 Slot Calculation Engine

The slot calculation is the heart of TimeTide. It determines available time slots considering:

1. **Base Availability** - Weekly schedule (e.g., Mon-Fri 9am-5pm)
2. **Date Overrides** - Specific date modifications
3. **Calendar Busy Times** - Events from connected calendars
4. **Buffer Times** - Gaps before/after bookings
5. **Minimum Notice** - How far in advance bookings must be made
6. **Maximum Booking Window** - How far out users can book
7. **Slot Duration** - Length of the event type
8. **Timezone Handling** - Convert between user/invitee/UTC

### Algorithm Flow

```
1. Get date range (today + min_notice → today + max_window)
2. For each day in range:
   a. Get base availability for that weekday
   b. Apply date overrides if any
   c. Generate potential slots based on duration
   d. Fetch busy times from connected calendars
   e. Fetch existing bookings
   f. Remove slots that:
      - Overlap with busy times
      - Overlap with existing bookings (including buffers)
      - Are before minimum notice time
   g. Convert remaining slots to invitee timezone
3. Return available slots grouped by date
```

## 🔐 Security Model

### Authentication
- NextAuth with OAuth providers (Google, GitHub) + credentials
- JWT tokens for API authentication
- CSRF protection on all mutations

### Authorization (RBAC)
- **Owner**: Full control over own resources
- **Team Admin**: Manage team settings and members
- **Team Member**: Create events, view team bookings
- **Public**: View public booking pages, create bookings

### Rate Limiting
- Public booking endpoint: 10 requests/minute per IP
- API endpoints: 100 requests/minute per user
- Implemented via middleware with Redis

### Input Validation
- All inputs validated with Zod schemas
- SQL injection prevention via Prisma
- XSS prevention via React's default escaping

## 🔄 Background Jobs

Using BullMQ with Redis for:

1. **Email Notifications**
   - Booking confirmations
   - Cancellation notices
   - Reminder emails (24h, 1h before)

2. **Calendar Sync**
   - Periodic refresh of busy times
   - Push notifications via webhooks (Google)

3. **Cleanup Jobs**
   - Remove expired booking attempts
   - Archive old bookings

## 📧 Email System

Using Resend for transactional emails:

- **Templates**: React Email components
- **Types**:
  - Booking confirmation (to host + invitee)
  - Booking cancellation
  - Booking rescheduled
  - Reminders

## 🌐 API Design

### Public API (rate limited)

```
GET  /api/slots?eventTypeId=X&date=YYYY-MM-DD&timezone=X
POST /api/bookings (create booking)
POST /api/bookings/:id/cancel
POST /api/bookings/:id/reschedule
```

### Authenticated API

```
# Event Types
GET    /api/event-types
POST   /api/event-types
GET    /api/event-types/:id
PUT    /api/event-types/:id
DELETE /api/event-types/:id

# Availability
GET    /api/availability
PUT    /api/availability
POST   /api/availability/overrides

# Bookings
GET    /api/bookings

# Calendars
POST   /api/calendars/google/connect
POST   /api/calendars/outlook/connect
DELETE /api/calendars/:id

# Teams
GET    /api/teams
POST   /api/teams
PUT    /api/teams/:id
POST   /api/teams/:id/members
DELETE /api/teams/:id/members/:userId
```

## 🎨 Design System

### Colors (Oceanic Theme)

```css
--ocean-50: #f0f9ff;   /* Lightest blue */
--ocean-100: #e0f2fe;
--ocean-200: #bae6fd;
--ocean-300: #7dd3fc;
--ocean-400: #38bdf8;
--ocean-500: #0ea5e9;  /* Primary */
--ocean-600: #0284c7;
--ocean-700: #0369a1;
--ocean-800: #075985;
--ocean-900: #0c4a6e;  /* Darkest blue */

--sand-50: #fefce8;    /* Accent - warm sand */
--sand-100: #fef9c3;
--sand-500: #eab308;

--coral-500: #f97316;  /* Warning/CTA accent */
--seafoam-500: #14b8a6; /* Success */
```

### Typography

- **Headings**: "Plus Jakarta Sans" (modern, friendly)
- **Body**: "Inter" (readable, neutral)
- **Mono**: "JetBrains Mono" (code, times)

## 🚀 Deployment

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://...

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Calendars
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=

# Email
RESEND_API_KEY=

# Redis (for BullMQ)
REDIS_URL=

# App
NEXT_PUBLIC_APP_URL=https://timetide.app
```

### Infrastructure

1. **Application**: Vercel or self-hosted Node.js
2. **Database**: PostgreSQL (Supabase, Railway, or self-hosted)
3. **Redis**: Upstash or self-hosted
4. **Email**: Resend

## 📋 MVP vs Phase 2 Features

### MVP (Phase 1)
- [x] User auth (Google OAuth + email/password)
- [x] Event type creation with basic settings
- [x] Weekly availability schedule
- [x] Public booking page
- [x] Slot calculation with timezone support
- [x] Google Calendar integration
- [x] Email notifications (confirmation)
- [x] Basic booking management (cancel)
- [x] Simple team scheduling (round-robin)

### Phase 2
- [ ] Microsoft Outlook/Graph integration
- [ ] Advanced recurring availability patterns
- [ ] Collective team availability
- [ ] Payments integration (Stripe)
- [ ] Custom booking questions with branching
- [ ] Webhooks for external integrations
- [ ] Analytics dashboard
- [ ] White-label embedding
- [ ] Mobile app
- [ ] SMS notifications
