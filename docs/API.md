# TimeTide API Reference

Complete REST API reference for TimeTide.app. All endpoints are under `/api/`.

## Authentication

Most endpoints require authentication via NextAuth JWT session cookie. Public endpoints are marked explicitly.

## Rate Limiting

Public booking and slot endpoints are rate-limited per IP address. Rate limit headers are included in responses:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

---

## Auth Endpoints

### `POST /api/auth/[...nextauth]`
NextAuth handler for OAuth callbacks and session management.

### `POST /api/auth/signup`
**Auth:** Public

Register a new user account.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name |
| `email` | string | Yes | Email address |
| `password` | string | Yes | Min 8 characters |

**Side effects:**
- Generates unique username from email
- Creates default availability schedule (Mon-Fri 9AM-5PM UTC)
- Creates default 30-min Google Meet event type
- Sends email verification link (24h expiry)

### `POST /api/auth/verify-email`
**Auth:** Public

Verify email with token from verification email.

### `POST /api/auth/resend-verification`
**Auth:** Public

Resend email verification link.

### `POST /api/auth/forgot-password`
**Auth:** Public

Initiate password reset flow.

### `POST /api/auth/reset-password`
**Auth:** Public

Complete password reset with token.

### `GET /api/auth/check-onboarding`
**Auth:** Required

Check if the authenticated user has completed onboarding.

---

## Users

### `GET /api/users/me`
**Auth:** Required

Get current authenticated user profile.

### `PUT /api/users/me`
**Auth:** Required

Update current user profile (name, username, bio, timezone).

### `POST /api/users/me/avatar`
**Auth:** Required

Upload user avatar image.

### `GET /api/users/[username]`
**Auth:** Public

Get public user profile by username.

### `GET /api/users/[username]/event-types`
**Auth:** Public

Get public event types for a user.

### `GET /api/users/check-username`
**Auth:** Public

Check if a username is available.

### `GET /api/avatar/[userId]`
**Auth:** Public

Get user avatar image.

---

## Event Types

### `GET /api/event-types`
**Auth:** Required

List all event types for the authenticated user. Includes booking count per type.

### `POST /api/event-types`
**Auth:** Required

Create a new event type.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Event type name |
| `description` | string | No | Description |
| `length` | number | Yes | Duration in minutes |
| `locationType` | enum | No | IN_PERSON, PHONE, GOOGLE_MEET, ZOOM, TEAMS, CUSTOM |
| `bufferBefore` | number | No | Minutes before buffer (PRO) |
| `bufferAfter` | number | No | Minutes after buffer (PRO) |
| `minimumNotice` | number | No | Min advance booking (minutes) |
| `periodType` | string | No | ROLLING, RANGE, UNLIMITED |
| `periodDays` | number | No | Rolling window days |
| `maxBookingsPerDay` | number | No | Daily booking limit |
| `requiresConfirmation` | boolean | No | Host approval required |
| `allowsRecurring` | boolean | No | Enable recurring bookings (PRO) |
| `seatsPerSlot` | number | No | Group booking capacity |
| `questions` | array | No | Custom booking form questions (PRO) |

**Plan enforcement:**
- FREE: Limited event type count
- PRO: Unlocks buffers, custom questions, recurring, booking limits
- Returns 403 if plan limit exceeded

### `GET /api/event-types/[id]`
**Auth:** Required

Get event type details.

### `PUT /api/event-types/[id]`
**Auth:** Required

Update event type.

### `DELETE /api/event-types/[id]`
**Auth:** Required

Delete event type (cascades to related data).

---

## Slots

### `GET /api/slots`
**Auth:** Public (rate limited)

Get available time slots for an event type.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `eventTypeId` | string | Yes | Event type ID |
| `startDate` | string | No | Start of date range (ISO) |
| `endDate` | string | No | End of date range (ISO) |
| `timezone` | string | No | Invitee timezone |

**Response includes:**
- Available slots grouped by date
- For group events: remaining seat counts
- Booking window boundaries

**Logic:**
- Checks ALL host bookings (across all event types)
- Fetches calendar busy times from Google/Outlook
- Applies buffer times, minimum notice, daily limits
- Graceful degradation if calendar APIs fail

### `GET /api/slots/team`
**Auth:** Public (rate limited)

Get available team slots. Same params plus handles ROUND_ROBIN, COLLECTIVE, MANAGED modes.

---

## Bookings

### `GET /api/bookings`
**Auth:** Required

List authenticated user's bookings.

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by booking status |
| `upcoming` | boolean | Only future bookings |
| `past` | boolean | Only past bookings |

### `POST /api/bookings`
**Auth:** Public (rate limited)

Create a new booking.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `eventTypeId` | string | Yes | Event type to book |
| `startTime` | string | Yes | Start time (ISO) |
| `endTime` | string | Yes | End time (ISO) |
| `name` | string | Yes | Invitee name |
| `email` | string | Yes | Invitee email |
| `timezone` | string | Yes | Invitee timezone |
| `notes` | string | No | Additional notes |
| `responses` | object | No | Custom question answers |
| `recurring` | object | No | `{ frequency, count }` for recurring |

**Side effects:**
- Calendar event creation (Google Meet/Teams/Zoom link)
- Confirmation/pending email queued
- Reminder email queued
- Webhook triggered (booking.created)
- In-app notification created
- Analytics counter updated

### `GET /api/bookings/[id]`
**Auth:** Required

Get booking details.

### `PUT /api/bookings/[id]`
**Auth:** Required

Update booking (confirm/reject).

### `DELETE /api/bookings/[id]`
**Auth:** Required

Cancel booking. Triggers cancellation email and webhook.

### `POST /api/bookings/[id]/reschedule`
**Auth:** Public

Reschedule a booking to a new time.

### `POST /api/bookings/[id]/assign`
**Auth:** Required

Assign a team member to a managed booking.

### `GET /api/bookings/[id]/calendar`
**Auth:** Public

Get .ics calendar data for a booking.

### `GET /api/bookings/series/[groupId]`
**Auth:** Required

Get all bookings in a recurring series.

### `DELETE /api/bookings/series/[groupId]`
**Auth:** Required

Cancel all bookings in a recurring series.

---

## Availability

### `GET /api/availability`
**Auth:** Required

List all availability schedules with slots and date overrides.

### `POST /api/availability`
**Auth:** Required

Create a new availability schedule.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Schedule name |
| `isDefault` | boolean | No | Set as default schedule |
| `slots` | array | No | Weekly availability slots |

### `GET /api/availability/[id]`
**Auth:** Required

Get schedule details with slots and overrides.

### `PUT /api/availability/[id]`
**Auth:** Required

Update schedule (name, default status, slots, overrides).

### `DELETE /api/availability/[id]`
**Auth:** Required

Delete availability schedule.

---

## Calendars

### `GET /api/calendars`
**Auth:** Required

List connected calendars with credential expiry info.

### `POST /api/calendars`
**Auth:** Required

Connect a calendar. Supports GOOGLE and OUTLOOK providers.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | enum | Yes | GOOGLE or OUTLOOK |
| `code` | string | No | OAuth code (if completing OAuth) |

If no `code`: Returns OAuth authorization URL.
If `code`: Exchanges for tokens and saves calendar.

### `GET /api/calendars/[id]`
**Auth:** Required

Get calendar details.

### `PUT /api/calendars/[id]`
**Auth:** Required

Update calendar settings.

### `DELETE /api/calendars/[id]`
**Auth:** Required

Disconnect calendar.

### `GET /api/calendars/sync`
**Auth:** Required

Trigger calendar sync.

### `POST /api/calendars/conflicts`
**Auth:** Required

Check for scheduling conflicts across calendars.

### `POST /api/calendars/google/callback`
Google OAuth callback handler.

### `POST /api/calendars/outlook/callback`
Outlook OAuth callback handler.

---

## Teams

### `GET /api/teams`
**Auth:** Required

List teams the user is a member of. Includes member details and event type counts.

### `POST /api/teams`
**Auth:** Required (teams feature gate)

Create a new team. Creator becomes OWNER.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Team name |
| `slug` | string | No | URL slug (auto-generated if omitted) |

### `GET /api/teams/[id]`
**Auth:** Required (team member)

Get team details with members and event types.

### `PUT /api/teams/[id]`
**Auth:** Required (admin/owner)

Update team name, slug, or logo.

### `DELETE /api/teams/[id]`
**Auth:** Required (owner only)

Delete team and all associated data.

### `POST /api/teams/[id]/logo`
**Auth:** Required (admin/owner)

Upload team logo image.

### `GET /api/teams/[id]/members`
**Auth:** Required (team member)

List team members with user details.

### `POST /api/teams/[id]/members`
**Auth:** Required (admin/owner)

Add a team member by email.

### `PUT /api/teams/[id]/members/[memberId]`
**Auth:** Required (admin/owner)

Update member role.

### `DELETE /api/teams/[id]/members/[memberId]`
**Auth:** Required (admin/owner)

Remove team member.

### `POST /api/teams/[id]/members/bulk`
**Auth:** Required (admin/owner)

Bulk add team members.

### Team Event Types

### `GET /api/teams/[id]/event-types`
**Auth:** Required (team member)

List team event types.

### `POST /api/teams/[id]/event-types`
**Auth:** Required (admin/owner)

Create team event type with scheduling type (ROUND_ROBIN, COLLECTIVE, MANAGED).

### `POST /api/teams/[id]/event-types/[eventTypeId]/assignments`
**Auth:** Required (admin/owner)

Assign members to a team event type.

### Team Invitations

### `GET /api/teams/[id]/invitations`
List pending team invitations.

### `POST /api/teams/[id]/invitations`
Send team invitation via email.

### `PUT /api/teams/[id]/invitations/[invitationId]`
Update invitation.

### `DELETE /api/teams/[id]/invitations/[invitationId]`
Cancel invitation.

### `POST /api/invitations/accept`
Accept a team invitation (via token).

### Team Audit

### `GET /api/teams/[id]/audit-log`
**Auth:** Required (admin/owner)

Get team activity audit log.

---

## Webhooks

### `GET /api/webhooks`
**Auth:** Required

List webhooks with 24-hour delivery statistics.

### `POST /api/webhooks`
**Auth:** Required (webhook plan limit)

Create webhook endpoint.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | HTTPS endpoint URL |
| `events` | array | Yes | Event types to subscribe to |
| `secret` | string | No | HMAC secret (auto-generated if omitted) |

**Events:** `booking.created`, `booking.cancelled`, `booking.rescheduled`, `booking.confirmed`, `booking.rejected`

**Delivery headers:**
- `X-Webhook-Event` - Event type
- `X-Webhook-Delivery` - Delivery ID
- `X-Webhook-Signature` - HMAC-SHA256 signature

### `GET /api/webhooks/[id]`
Get webhook details.

### `PUT /api/webhooks/[id]`
Update webhook URL, events, or active status.

### `DELETE /api/webhooks/[id]`
Delete webhook.

### `POST /api/webhooks/[id]/test`
Send test payload to webhook endpoint.

### `POST /api/webhooks/[id]/deliveries/[deliveryId]/retry`
Retry a failed webhook delivery.

---

## Notifications

### `GET /api/notifications`
**Auth:** Required

Fetch paginated notifications (cursor-based, 20 per page).

**Response:**
- `notifications[]` - Notification array
- `unreadCount` - Total unread
- `nextCursor` - Pagination cursor

### `GET /api/notifications/[id]`
Get single notification.

### `PUT /api/notifications/[id]`
Mark notification as read.

### `DELETE /api/notifications/[id]`
Delete notification.

### `POST /api/notifications/mark-all-read`
Mark all notifications as read.

---

## Analytics

### `GET /api/analytics`
**Auth:** Required (analytics feature gate - TEAM plan)

Returns comprehensive booking analytics:

| Metric | Description |
|--------|-------------|
| `totalBookings` | All-time booking count |
| `thisMonth` | Current month bookings |
| `totalHours` | Total meeting hours (completed/confirmed) |
| `uniqueGuests` | Distinct invitee emails |
| `cancellationRate` | Percentage cancelled |
| `bookingsOverTime` | 30-day daily counts |
| `popularEventTypes` | Top 5 by booking count |
| `bookingTimes` | Hour-of-day distribution |
| `statusDistribution` | Counts by status |
| `leadTime` | Advance booking distribution |
| `dayOfWeek` | Busiest days |
| `repeatGuests` | Return visitor breakdown |

---

## Zoom Integration

### `GET /api/zoom/connect`
**Auth:** Required

Redirect to Zoom OAuth authorization.

### `GET /api/zoom/callback`
Zoom OAuth callback handler.

### `POST /api/zoom/disconnect`
**Auth:** Required

Disconnect Zoom account.

### `GET /api/zoom/status`
**Auth:** Required

Check Zoom connection status.

---

## Public Endpoints

### `GET /api/public/event-types`
Get public event types listing.

### `GET /api/public/team-event-types`
Get public team event types.

### `GET /api/public/teams/[teamSlug]`
Get public team information.

### `POST /api/contact`
Submit contact form.

---

## Error Responses

All endpoints return consistent error formats:

```json
{
  "error": "Human-readable error message"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Validation error or bad request |
| 401 | Not authenticated |
| 403 | Forbidden (plan limit or insufficient role) |
| 404 | Resource not found |
| 409 | Conflict (slot unavailable, duplicate) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## Billing & Subscriptions

> Full details: [docs/BILLING.md](BILLING.md)

### `POST /api/billing/checkout`
**Auth:** Required

Create or update a Stripe subscription.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `plan` | string | Yes | `PRO` or `TEAM` |

**Logic:**
- Blocks downgrades (use schedule-downgrade instead)
- Blocks same-plan if ACTIVE
- Blocks if DOWNGRADING (cancel scheduled switch first)
- Creates checkout session or updates existing subscription with proration

**Response:**
```json
{ "url": "https://checkout.stripe.com/..." }
```

### `POST /api/billing/schedule-downgrade`
**Auth:** Required

Schedule a plan downgrade at end of billing period.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `plan` | string | Yes | Target plan (`FREE`, `PRO`) — must be lower than current |

**Response:**
```json
{
  "success": true,
  "switchDate": "2026-04-19T00:00:00.000Z",
  "message": "Your plan will switch to FREE on 4/19/2026"
}
```

### `DELETE /api/billing/schedule-downgrade`
**Auth:** Required

Cancel a scheduled downgrade. Restores plan to ACTIVE.

### `POST /api/billing/portal`
**Auth:** Required

Redirect to Stripe Customer Portal for invoice/payment management.

**Response:**
```json
{ "url": "https://billing.stripe.com/..." }
```

### `POST /api/webhooks/stripe`
**Auth:** Stripe webhook signature verification

Handles Stripe webhook events:
- `customer.subscription.created` — Activate subscription
- `customer.subscription.updated` — Handle cancel/uncancel/plan change
- `customer.subscription.deleted` — Start grace period
- `invoice.payment_succeeded` — Renew subscription
- `invoice.payment_failed` — Start grace period when retries exhausted

Always returns `{ "received": true }`.

---

## Admin Endpoints

### `GET /api/admin/stats`
**Auth:** Admin only

Dashboard statistics (user counts, booking counts, revenue metrics).

### `GET /api/admin/analytics`
**Auth:** Admin only

Platform-wide analytics data.

### `GET /api/admin/users`
**Auth:** Admin only

List all users with pagination, search, and filtering.

### `GET /api/admin/users/[id]`
**Auth:** Admin only

Detailed user profile including event types, bookings, team memberships, calendars, webhooks, support tickets, and subscription history.

### `PATCH /api/admin/users/[id]`
**Auth:** Admin only (rate limited: 30/min)

Update user fields or perform subscription actions.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `role` | string | No | `USER` or `ADMIN` |
| `isDisabled` | boolean | No | Disable/enable account |
| `plan` | string | No | Target plan (triggers implicit upgrade/downgrade) |
| `planAction` | string | No | `upgrade`, `downgrade_immediate`, `downgrade_grace`, `cancel_downgrade` |
| `gracePeriodDays` | number | No | Grace period days (for `downgrade_grace`) |

**Transition validation:**
- `upgrade`: allowed from any status; target must be higher than current
- `downgrade_immediate`: allowed from ACTIVE, UNSUBSCRIBED, GRACE_PERIOD, DOWNGRADING
- `downgrade_grace`: allowed from ACTIVE, UNSUBSCRIBED
- `cancel_downgrade`: allowed from DOWNGRADING only

**Response includes `stripeSyncSuccess` and optional `warning` if Stripe sync failed.**

**Error (invalid transition):**
```json
{
  "error": "Cannot downgrade: user is already in LOCKED status",
  "code": "INVALID_TRANSITION",
  "currentStatus": "LOCKED",
  "currentPlan": "FREE"
}
```

### `DELETE /api/admin/users/[id]`
**Auth:** Admin only

Delete user (cannot delete admin users).

### `POST /api/admin/users/[id]/impersonate`
**Auth:** Admin only

Start impersonating a user. Modifies JWT with `originalAdminId`.

### `GET /api/admin/users/[id]/subscription`
**Auth:** Admin only

Get user's Stripe subscription details.

### `GET /api/admin/users/[id]/downgrade-preview`
**Auth:** Admin only

Preview what resources would be locked on downgrade.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `targetPlan` | string | No | Target plan (default: FREE) |

**Response:**
```json
{
  "targetPlan": "FREE",
  "currentPlan": "PRO",
  "personalEventTypes": { "active": 5, "toLock": 4, "toKeep": 1, "items": [...] },
  "webhooks": { "active": 3, "toLock": 3, "toKeep": 0, "items": [...] },
  "teamEventTypes": { "active": 0, "toLock": 0, "items": [] },
  "featuresLost": ["customQuestions", "groupBooking", "recurringBooking"]
}
```

### `GET /api/admin/bookings`
**Auth:** Admin only

List all bookings with pagination and filtering.

### `GET /api/admin/teams`
**Auth:** Admin only

List all teams with member counts.

### `GET /api/admin/teams/[id]`
**Auth:** Admin only

Detailed team information.

### `GET /api/admin/tickets`
**Auth:** Admin only

List support tickets with filtering.

### `GET /api/admin/tickets/[id]`
**Auth:** Admin only

Get ticket details with messages.

### `PATCH /api/admin/tickets/[id]`
**Auth:** Admin only

Update ticket status or priority.

### `POST /api/admin/tickets/[id]/messages`
**Auth:** Admin only

Reply to a support ticket.

### `GET /api/admin/audit-log`
**Auth:** Admin only

Admin action audit trail with pagination.

### `GET /api/admin/system`
**Auth:** Admin only

System health information (queue stats, Redis status, etc.).

### `POST /api/admin/system/webhooks/[deliveryId]/retry`
**Auth:** Admin only

Retry a failed webhook delivery.

---

## Support Tickets

### `GET /api/tickets`
**Auth:** Required

List user's support tickets.

### `POST /api/tickets`
**Auth:** Required

Create a new support ticket.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subject` | string | Yes | Ticket subject |
| `message` | string | Yes | Initial message |
| `priority` | string | No | LOW, MEDIUM, HIGH, URGENT |

### `GET /api/tickets/[id]`
**Auth:** Required

Get ticket details with messages.

### `POST /api/tickets/[id]/messages`
**Auth:** Required

Add a message to a ticket.

---

## Development-Only

### `GET /api/mock/switch-plan`
**Environment:** Development only

Switch user plan for testing. Query param: `plan=FREE|PRO|TEAM`

---

*Last updated: March 2026*
