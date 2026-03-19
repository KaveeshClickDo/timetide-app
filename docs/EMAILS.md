# TimeTide Email System

Complete documentation for all email types, triggers, queue configuration, and template generators.

## Overview

TimeTide uses a BullMQ-based email queue backed by Redis (with direct-send fallback when Redis is unavailable). Emails are sent via the Resend API. All templates are HTML strings generated in `src/lib/integrations/email/client.ts`.

---

## Queue Configuration

| Setting | Value |
|---------|-------|
| Queue name | `email-queue` |
| Concurrency | 5 emails processed simultaneously |
| Max retries | 3 |
| Backoff | Exponential (1s → 2s → 4s) |
| Completed job retention | 24 hours or 1000 jobs |
| Failed job retention | 7 days |
| Fallback | Direct send when Redis unavailable |

---

## Email Types

### Booking Emails

| Type | Subject | Trigger | Recipients | Generator |
|------|---------|---------|------------|-----------|
| `booking_confirmed` | "Confirmed: {event} with {name}" | Booking created (auto-confirm) | Invitee + Host | `generateBookingConfirmedEmail` |
| `booking_cancelled` | "Cancelled: {event} - {name} cancelled" | Booking cancelled | Invitee + Host | `generateBookingCancelledEmail` |
| `booking_pending` | "Pending: {event} - Awaiting Confirmation" (invitee) / "Action Required: New booking request" (host) | Booking created (requires confirmation) | Invitee + Host | `generateBookingPendingEmail` |
| `booking_confirmed_by_host` | "Confirmed: {event} with {host}" | Host confirms pending booking | Invitee | `generateBookingConfirmedByHostEmail` |
| `booking_rejected` | "Declined: {event} with {host}" | Host rejects pending booking | Invitee | `generateBookingRejectedEmail` |
| `booking_reminder` | "Reminder: {event} in {hours} hour(s)" | Scheduled job (24h and 1h before) | Invitee + Host | `generateReminderEmail` |
| `booking_rescheduled` | "Rescheduled: {event} with {name}" | Booking time changed | Invitee + Host | `generateBookingRescheduledEmail` |
| `recurring_booking_confirmed` | "Confirmed: {count} {freq} {event}" | Recurring series created | Invitee + Host | `generateRecurringBookingConfirmedEmail` |
| `bulk_confirmed_by_host` | "Confirmed: All {count} sessions of {event}" | Host confirms all pending recurring | Invitee | `generateBulkConfirmedByHostEmail` |

### Team Emails

| Type | Subject | Trigger | Recipients | Generator |
|------|---------|---------|------------|-----------|
| `team_member_added` | "You've been added to {team} on TimeTide" | Owner adds member directly | New member | `generateTeamMemberAddedEmail` |
| `team_invitation` | "You're invited to join {team} on TimeTide" | Owner sends invitation | Invitee | `generateTeamInvitationEmail` |

### Subscription / Plan Emails

| Type | Subject | Trigger | Recipients | Generator |
|------|---------|---------|------------|-----------|
| `plan_activated` | "Welcome to {plan}!" | New subscription activated | User | `generatePlanActivatedEmail` |
| `plan_reactivated` | "Welcome back! Features restored" | Upgrade from LOCKED status | User | `generatePlanReactivatedEmail` |
| `subscription_cancelled` | "Subscription cancelled" | User cancels subscription | User | `generateSubscriptionCancelledEmail` |
| `plan_expiring_warning` | Dynamic (set by caller) | Background job: before planExpiresAt | User | `generatePlanExpiringEmail` |
| `grace_period_started` | Dynamic (set by caller) | Billing period ends, grace begins | User | `generateGracePeriodStartedEmail` |
| `grace_period_ending` | Dynamic (set by caller) | 2 days and 1 day before grace ends | User | `generateGracePeriodEndingEmail` |
| `plan_locked` | Dynamic (set by caller) | Grace period ends, features locked | User | `generatePlanLockedEmail` |
| `user_downgrade_scheduled` | Dynamic (set by caller) | User schedules plan downgrade | User | `generateUserDowngradeScheduledEmail` |
| `downgrade_cancelled` | "Your {plan} plan switch has been cancelled" | User or admin cancels scheduled downgrade | User | `generateDowngradeCancelledEmail` |
| `admin_downgrade_notice` | "Your plan has been changed" | Admin downgrades immediately | User | `generateAdminDowngradeEmail` |
| `admin_downgrade_grace_notice` | "Your plan change has been scheduled" | Admin schedules downgrade with grace period | User | `generateAdminDowngradeGraceEmail` |

### Other

| Type | Subject | Trigger | Recipients | Generator |
|------|---------|---------|------------|-----------|
| `custom` | Custom | Direct `queueEmail()` call with custom HTML | Custom | N/A (uses `customHtml` field) |

---

## Trigger Locations

### Booking Flow

| File | Line | Action | Email Type |
|------|------|--------|------------|
| `src/app/api/bookings/route.ts` | ~1012 | Create booking (auto-confirm) | `booking_confirmed` |
| `src/app/api/bookings/route.ts` | ~1012 | Create booking (requires confirm) | `booking_pending` |
| `src/app/api/bookings/route.ts` | ~1012 | Create recurring booking | `recurring_booking_confirmed` |
| `src/app/api/bookings/[id]/route.ts` | ~689 | Host confirms pending | `booking_confirmed_by_host` |
| `src/app/api/bookings/[id]/route.ts` | ~698 | Host rejects pending | `booking_rejected` |
| `src/app/api/bookings/[id]/route.ts` | ~388 | Host bulk confirms recurring | `bulk_confirmed_by_host` |
| `src/app/api/bookings/[id]/route.ts` | ~980 | Cancel booking | `booking_cancelled` |
| `src/app/api/bookings/[id]/reschedule/route.ts` | ~452 | Reschedule booking | `booking_rescheduled` |
| `src/app/api/bookings/[id]/assign/route.ts` | ~287 | Host assigns to self | `booking_confirmed` |

### Team Flow

| File | Line | Action | Email Type |
|------|------|--------|------------|
| `src/app/api/teams/[id]/members/route.ts` | ~200 | Add member directly | `team_member_added` |
| `src/app/api/teams/[id]/invitations/route.ts` | ~196 | Send team invitation | `team_invitation` |

### Subscription Lifecycle

| File | Function | Email Type |
|------|----------|------------|
| `src/lib/subscription-lifecycle.ts` | `activateSubscription()` | `plan_activated` or `plan_reactivated` |
| `src/lib/subscription-lifecycle.ts` | `voluntaryUnsubscribe()` | `subscription_cancelled` |
| `src/lib/subscription-lifecycle.ts` | `startGracePeriod()` | `grace_period_started` |
| `src/lib/subscription-lifecycle.ts` | `adminDowngradeImmediate()` | `admin_downgrade_notice` |
| `src/lib/subscription-lifecycle.ts` | `adminDowngradeWithGrace()` | `admin_downgrade_grace_notice` |
| `src/lib/subscription-lifecycle.ts` | `scheduleUserDowngrade()` | `user_downgrade_scheduled` |
| `src/lib/subscription-lifecycle.ts` | `cancelDowngrade()` | `downgrade_cancelled` |
| `src/lib/subscription-lifecycle.ts` | `lockResources()` (via startGracePeriod) | `plan_locked` |

### Background Jobs

| File | Job | Email Type |
|------|-----|------------|
| `src/lib/infrastructure/queue/subscription-queue.ts` | `send_warning` (expiring) | `plan_expiring_warning` |
| `src/lib/infrastructure/queue/subscription-queue.ts` | `send_warning` (grace_ending) | `grace_period_ending` |
| `src/lib/infrastructure/queue/reminder-queue.ts` | reminder job | `booking_reminder` |

---

## Data Types

### BookingEmailData

```typescript
interface BookingEmailData {
  inviteeName: string
  inviteeEmail: string
  hostName: string
  hostEmail: string
  hostUsername: string
  eventTitle: string
  eventSlug: string
  eventDescription?: string
  bookingUid: string
  startTime: string        // ISO date in invitee timezone
  endTime: string
  timezone: string
  hostStartTime: string    // ISO date in host timezone
  hostEndTime: string
  hostTimezone: string
  location?: string
  meetingUrl?: string
  notes?: string
  teamMembers?: string[]
}
```

### RecurringBookingEmailData

```typescript
interface RecurringBookingEmailData extends BookingEmailData {
  totalOccurrences: number
  frequencyLabel: string     // e.g., "weekly", "biweekly"
  recurringDates: string[]   // All dates in invitee timezone
  hostRecurringDates: string[]
}
```

### PlanEmailData

```typescript
interface PlanEmailData {
  userName: string
  userEmail: string
  currentPlan: string
  newPlan?: string
  expiresAt?: string
  gracePeriodEndsAt?: string
  lockedEventCount?: number
  lockedTeamEventCount?: number
  lockedWebhookCount?: number
  reactivateUrl: string      // Link to /dashboard/billing
}
```

### TeamEmailData

```typescript
interface TeamEmailData {
  memberName: string
  teamName: string
  actorName: string
  expiresIn?: string         // For invitations
  acceptUrl?: string         // Invitation accept link
}
```

---

## Queue Helper Functions

### Booking Emails

| Function | What it does |
|----------|-------------|
| `queueBookingConfirmationEmails(booking, eventType, host)` | Sends confirmed email to both invitee and host |
| `queueBookingCancellationEmails(booking, eventType, host, cancelledBy)` | Sends cancellation email to both parties |
| `queueBookingPendingEmails(booking, eventType, host)` | Sends pending email to invitee + action-required to host |
| `queueBookingConfirmedByHostEmail(booking, eventType, host)` | Sends confirmation to invitee after host approves |
| `queueBookingRejectedEmail(booking, eventType, host)` | Sends rejection to invitee |
| `queueReminderEmail(booking, eventType, host, hoursUntil)` | Sends reminder to invitee + host |
| `queueBookingRescheduledEmails(booking, eventType, host, oldTime)` | Sends reschedule notice with old/new times |
| `queueRecurringBookingConfirmationEmails(bookings, eventType, host)` | Sends series confirmation with all dates |
| `queueBulkConfirmedByHostEmail(bookings, eventType, host)` | Sends bulk confirmation to invitee |

### Plan Emails

| Function | What it does |
|----------|-------------|
| `enqueuePlanEmail(type, email, subject, data)` | Queues any plan-related email with PlanEmailData |

### Team Emails

| Function | What it does |
|----------|-------------|
| `queueTeamMemberAddedEmail(email, data)` | Member added notification |
| `queueTeamInvitationEmail(email, data)` | Invitation with accept link |

---

## Key Files

| Purpose | File |
|---------|------|
| Email templates (all generators) | `src/lib/integrations/email/client.ts` |
| Email queue & workers | `src/lib/infrastructure/queue/email-queue.ts` |
| Reminder queue | `src/lib/infrastructure/queue/reminder-queue.ts` |
| Subscription queue (warnings) | `src/lib/infrastructure/queue/subscription-queue.ts` |
| Email type definitions | `src/types/queue.ts` |
| Email data types | `src/types/email.ts` |

---

*Last updated: March 2026*
