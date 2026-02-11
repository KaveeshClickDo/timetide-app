# <img src="public/logo.svg" width="28" height="28" alt="TimeTide" /> TimeTide.app

**Modern scheduling that flows with your time.**

TimeTide is a clean, modern scheduling platform that helps professionals and teams manage their availability and bookings effortlessly. Inspired by the natural rhythm of tides, TimeTide adapts to your schedule.

![TimeTide Banner](./public/og-image.png)

## ✨ Features

### Core Scheduling
- **Event Types**: Create custom meeting types with durations, buffers, and custom questions
- **Smart Availability**: Set complex availability rules with timezone support
- **Public Booking Links**: Share `timetide.app/username/event` links
- **Calendar Sync**: Real-time sync with Google Calendar (Outlook coming soon)
- **Email Notifications**: Automatic confirmations and reminders

### Team Scheduling (MVP)
- **Round-Robin**: Distribute meetings across team members
- **Collective Availability**: Find times when all team members are free
- **Team Pages**: Shared booking pages for teams

### Smart Features
- **Timezone Detection**: Automatic timezone handling with DST support
- **Buffer Times**: Before/after meeting buffers
- **Booking Windows**: Min notice and max future booking limits
- **Double-Booking Prevention**: Real-time availability checking

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        TimeTide.app                              │
├─────────────────────────────────────────────────────────────────┤
│  Next.js 14 (App Router) + TypeScript                           │
├──────────────────┬──────────────────┬───────────────────────────┤
│   Public Pages   │   Dashboard      │   API Routes              │
│   - Landing      │   - Event Types  │   - /api/bookings         │
│   - Booking      │   - Availability │   - /api/slots            │
│   - Confirmation │   - Bookings     │   - /api/calendars        │
│                  │   - Teams        │   - /api/webhooks         │
├──────────────────┴──────────────────┴───────────────────────────┤
│                    Service Layer                                 │
│   - SlotCalculator    - BookingService    - CalendarSync        │
│   - AvailabilityEngine - NotificationService                    │
├─────────────────────────────────────────────────────────────────┤
│                    Data Layer (Prisma)                          │
│   PostgreSQL: Users, EventTypes, Bookings, Teams, Calendars     │
├─────────────────────────────────────────────────────────────────┤
│                    External Services                            │
│   - Google Calendar API    - Resend (Email)    - Redis (Jobs)   │
└─────────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis (for background jobs)
- Google Cloud Project (for Calendar API)

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/timetide-app.git
cd timetide-app
npm install
```

### 2. Environment Setup

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/timetide"

# Auth (NextAuth)
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-min-32-chars"

# Google OAuth + Calendar
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Microsoft (optional for v1)
MICROSOFT_CLIENT_ID=""
MICROSOFT_CLIENT_SECRET=""

# Email (Resend)
RESEND_API_KEY="re_xxxxxxxxxxxx"
EMAIL_FROM="notifications@timetide.app"

# Redis (for background jobs)
REDIS_URL="redis://localhost:6379"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 3. Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init

# (Optional) Seed demo data
npx prisma db seed
```

### 4. Google Calendar Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable the Google Calendar API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
6. Add scopes: `calendar.readonly`, `calendar.events`

### 5. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:3000`

## 📁 Project Structure

```
timetide-app/
├── prisma/
│   ├── schema.prisma          # Data model
│   └── seed.ts                # Demo data seeder
├── src/
│   ├── app/
│   │   ├── (auth)/            # Auth pages (login/signup)
│   │   ├── (dashboard)/       # Protected dashboard pages
│   │   │   ├── dashboard/
│   │   │   ├── event-types/
│   │   │   ├── availability/
│   │   │   ├── bookings/
│   │   │   └── teams/
│   │   ├── (public)/          # Public pages
│   │   │   └── [username]/[eventSlug]/
│   │   ├── api/               # API routes
│   │   │   ├── auth/
│   │   │   ├── bookings/
│   │   │   ├── slots/
│   │   │   ├── calendars/
│   │   │   └── webhooks/
│   │   ├── layout.tsx
│   │   └── page.tsx           # Landing page
│   ├── components/
│   │   ├── ui/                # shadcn/ui components
│   │   ├── booking/           # Booking-related components
│   │   ├── dashboard/         # Dashboard components
│   │   └── shared/            # Shared components
│   ├── lib/
│   │   ├── auth.ts            # NextAuth config
│   │   ├── prisma.ts          # Prisma client
│   │   ├── slots/             # Slot calculation engine
│   │   │   ├── calculator.ts
│   │   │   ├── availability.ts
│   │   │   └── timezone.ts
│   │   ├── calendar/          # Calendar integrations
│   │   │   ├── google.ts
│   │   │   └── microsoft.ts
│   │   ├── email/             # Email templates & sending
│   │   ├── queue/             # Background job processing
│   │   └── validators/        # Zod schemas
│   ├── hooks/                 # React hooks
│   ├── types/                 # TypeScript types
│   └── styles/
│       └── globals.css
├── public/
├── .env.example
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.js
```

## 📊 Data Model Overview

```
User ─────────────┬──── EventType ──── Booking
                  │         │
                  │         └──── BookingQuestion
                  │
                  ├──── Calendar ──── CalendarEvent
                  │
                  ├──── Availability
                  │
                  └──── TeamMember ──── Team
```

## 🔌 API Endpoints

### Public API
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/slots/[eventTypeId]` | Get available time slots |
| POST | `/api/bookings` | Create a new booking |
| GET | `/api/bookings/[uid]` | Get booking details |
| PATCH | `/api/bookings/[uid]/cancel` | Cancel a booking |
| PATCH | `/api/bookings/[uid]/reschedule` | Reschedule a booking |

### Protected API (requires auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/event-types` | List/create event types |
| GET/PATCH/DELETE | `/api/event-types/[id]` | Manage event type |
| GET/POST | `/api/availability` | Manage availability |
| POST | `/api/calendars/connect` | Connect calendar |
| DELETE | `/api/calendars/[id]` | Disconnect calendar |

## 🎨 Brand Guidelines

### Colors
- **Ocean Deep**: `#0c4a6e` (primary)
- **Tide Blue**: `#0ea5e9` (accent)
- **Seafoam**: `#a5f3fc` (light accent)
- **Sand**: `#fef3c7` (warm neutral)
- **Coral**: `#f97316` (CTA/warning)

### Typography
- **Headings**: Plus Jakarta Sans
- **Body**: Inter

### Design Principles
- Calm, professional, trustworthy
- Oceanic metaphors (tides, waves, flow)
- Minimal, focused interfaces
- Generous whitespace

## 📋 MVP Roadmap

### Phase 1: Core (Current)
- [x] User authentication
- [x] Event type creation
- [x] Availability management
- [x] Public booking page
- [x] Slot calculation engine
- [x] Google Calendar integration
- [x] Email notifications
- [x] Booking management

### Phase 2: Teams & Polish
- [ ] Team creation & management
- [ ] Round-robin scheduling
- [ ] Collective availability
- [ ] Microsoft Outlook integration
- [ ] Recurring availability rules
- [ ] Custom branding per user

### Phase 3: Scale
- [ ] Webhooks for integrations
- [ ] Zapier/Make integration
- [ ] Analytics dashboard
- [ ] Payment integration (Stripe)
- [ ] Custom domains
- [ ] API access for developers

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Type checking
npm run type-check
```

## 🚢 Deployment

### Vercel (Recommended)
```bash
vercel --prod
```

### Docker
```bash
docker build -t timetide-app .
docker run -p 3000:3000 timetide-app
```

### Self-hosted (Debian)
See [DEPLOYMENT.md](./docs/DEPLOYMENT.md) for detailed instructions.

## 📄 License

MIT License - see [LICENSE](./LICENSE)

## 🤝 Contributing

Contributions welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) first.

---

Built with <img src="public/logo.svg" width="16" height="16" alt="TimeTide" /> by the TimeTide team
