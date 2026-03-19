# TimeTide Database Schema

PostgreSQL 16 database managed via Prisma ORM v7.3. Schema file: `prisma/schema.prisma`.

## Entity Relationship Overview

```
User (1) ──── (N) Account
  |  |
  |  └──── (N) Session
  |
  ├──── (N) EventType ──── (N) Booking
  |         |                    |
  |         ├── (N) EventTypeQuestion
  |         |                    ├── (N) BookingAttendee
  |         └── (N) EventTypeAssignment
  |                              └── BookingAnalytics
  ├──── (N) AvailabilitySchedule
  |              |
  |              ├── (N) AvailabilitySlot
  |              └── (N) DateOverride
  |
  ├──── (N) Calendar
  |         └── (1) CalendarCredential
  |         └── (N) CalendarSyncedEvent
  |
  ├──── (1) ZoomCredential
  |
  ├──── (N) TeamMember ──── Team
  |                          |
  |                          ├── (N) TeamInvitation
  |                          ├── (N) TeamAuditLog
  |                          └── (N) EventType (team events)
  |
  ├──── (N) Webhook ──── (N) WebhookDelivery
  |
  └──── (N) Notification
```

## Models

### User
Core user account model.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (cuid) | Primary key |
| `name` | String? | Display name |
| `email` | String (unique) | Email address |
| `emailVerified` | DateTime? | Verification timestamp |
| `password` | String? | bcrypt hash (null for OAuth-only) |
| `image` | String? | Avatar URL |
| `avatarData` | Bytes? | Uploaded avatar binary data |
| `avatarMimeType` | String? | Avatar MIME type |
| `username` | String? (unique) | Booking URL slug |
| `bio` | String? | Profile biography |
| `timezone` | String | User timezone (default: UTC) |
| `timezoneAutoDetect` | Boolean | Auto-detect timezone from browser |
| `plan` | UserPlan | FREE, PRO, or TEAM |
| `role` | UserRole | USER or ADMIN |
| `isDisabled` | Boolean | Account disabled by admin |
| `onboardingCompleted` | Boolean | Completed setup wizard |
| `stripeCustomerId` | String? | Stripe customer ID |
| `stripeSubscriptionId` | String? | Stripe subscription ID |
| `subscriptionStatus` | String | NONE, ACTIVE, UNSUBSCRIBED, GRACE_PERIOD, DOWNGRADING, LOCKED |
| `planActivatedAt` | DateTime? | When current plan was activated |
| `planExpiresAt` | DateTime? | When billing period ends |
| `gracePeriodEndsAt` | DateTime? | When grace period ends |
| `cleanupScheduledAt` | DateTime? | When resource cleanup is scheduled |
| `downgradeReason` | String? | Why downgrade was initiated |
| `downgradeInitiatedBy` | String? | Who initiated (user, system, admin:{id}) |
| `createdAt` | DateTime | Account creation |
| `updatedAt` | DateTime | Last update |

**Relations:** accounts, sessions, eventTypes, availabilitySchedules, bookings, calendars, zoomCredential, teamMembers, webhooks, notifications, supportTickets, subscriptionHistory

### Account
OAuth provider accounts linked to users (NextAuth adapter).

| Field | Type | Description |
|-------|------|-------------|
| `provider` | String | OAuth provider (google, etc.) |
| `providerAccountId` | String | Provider's user ID |
| `type` | String | Account type |
| `access_token` | String? | OAuth access token |
| `refresh_token` | String? | OAuth refresh token |
| `expires_at` | Int? | Token expiry timestamp |
| `token_type` | String? | Bearer, etc. |
| `scope` | String? | Granted scopes |
| `id_token` | String? | OpenID token |

**Unique:** (provider, providerAccountId)

### EventType
Bookable meeting templates.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (cuid) | Primary key |
| `title` | String | Event name |
| `slug` | String | URL-safe identifier |
| `description` | String? | Description |
| `length` | Int | Duration in minutes |
| `locationType` | LocationType | Meeting location type |
| `locationValue` | String? | Custom location details |
| `isActive` | Boolean | Active/visible |
| `lockedByDowngrade` | Boolean | Locked due to plan downgrade |
| `color` | String? | Display color |
| `bufferBefore` | Int | Minutes before buffer (default: 0) |
| `bufferAfter` | Int | Minutes after buffer (default: 0) |
| `minimumNotice` | Int | Min advance booking in minutes (default: 60) |
| `periodType` | String | ROLLING, RANGE, UNLIMITED |
| `periodDays` | Int? | Rolling window days |
| `periodStartDate` | DateTime? | Range start |
| `periodEndDate` | DateTime? | Range end |
| `maxBookingsPerDay` | Int? | Daily booking limit |
| `requiresConfirmation` | Boolean | Host approval required |
| `successRedirectUrl` | String? | Post-booking redirect |
| `seatsPerSlot` | Int? | Group booking capacity |
| `allowsRecurring` | Boolean | Enable recurring bookings |
| `recurringMaxWeeks` | Int? | Max recurring weeks |
| `recurringFrequency` | String? | weekly, biweekly, monthly, custom |
| `recurringInterval` | Int? | Custom interval value |
| `schedulingType` | SchedulingType? | Team: ROUND_ROBIN, COLLECTIVE, MANAGED |
| `lastAssignedMemberId` | String? | Round-robin tracking |
| `userId` | String | Owner user ID |
| `teamId` | String? | Team ID (null for personal) |
| `scheduleId` | String? | Linked availability schedule |

**Unique:** (userId, slug)
**Relations:** user, team, schedule, bookings, questions, assignments

### Booking
Individual booking records.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (cuid) | Primary key |
| `uid` | String (unique) | Public booking ID |
| `title` | String | Booking title |
| `startTime` | DateTime | Meeting start (UTC) |
| `endTime` | DateTime | Meeting end (UTC) |
| `status` | BookingStatus | Current status |
| `inviteeName` | String | Guest name |
| `inviteeEmail` | String | Guest email |
| `inviteeTimezone` | String? | Guest timezone |
| `inviteePhone` | String? | Guest phone |
| `notes` | String? | Additional notes |
| `responses` | Json? | Custom question answers |
| `location` | String? | Meeting location |
| `meetingUrl` | String? | Video conference URL |
| `calendarEventId` | String? | External calendar event ID |
| `cancellationReason` | String? | Reason for cancellation |
| `cancelledBy` | String? | HOST or INVITEE |
| `rescheduledFrom` | String? | Original booking ID |
| `rescheduledAt` | DateTime? | Reschedule timestamp |
| `recurringGroupId` | String? | Links recurring instances |
| `recurringIndex` | Int? | Position in series (1-based) |
| `recurringCount` | Int? | Total in series |
| `assignedMemberId` | String? | Assigned team member |
| `hostId` | String | Host user ID |
| `eventTypeId` | String | Event type ID |

**Relations:** host, eventType, attendees (group bookings)

### BookingAttendee
Additional attendees for group bookings.

| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Attendee name |
| `email` | String | Attendee email |
| `timezone` | String? | Attendee timezone |
| `bookingId` | String | Parent booking |

### BookingAnalytics
Daily booking analytics aggregation.

| Field | Type | Description |
|-------|------|-------------|
| `date` | DateTime | Analytics date |
| `userId` | String | User ID |
| `bookingCount` | Int | Bookings on this date |

**Unique:** (date, userId)

### AvailabilitySchedule
Named weekly availability templates.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (cuid) | Primary key |
| `name` | String | Schedule name |
| `timezone` | String | Schedule timezone |
| `isDefault` | Boolean | Default schedule flag |
| `userId` | String | Owner user ID |

**Relations:** user, slots, dateOverrides, eventTypes

### AvailabilitySlot
Weekly recurring time windows within a schedule.

| Field | Type | Description |
|-------|------|-------------|
| `dayOfWeek` | Int | 0 (Sun) - 6 (Sat) |
| `startTime` | String | Start time (HH:mm) |
| `endTime` | String | End time (HH:mm) |
| `scheduleId` | String | Parent schedule |

### DateOverride
Specific date availability overrides (holidays, custom hours).

| Field | Type | Description |
|-------|------|-------------|
| `date` | DateTime | Override date |
| `startTime` | String? | Custom start (null = day off) |
| `endTime` | String? | Custom end (null = day off) |
| `isWorking` | Boolean | Working day flag |
| `scheduleId` | String | Parent schedule |

### Calendar
Connected external calendar accounts.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (cuid) | Primary key |
| `provider` | CalendarProvider | GOOGLE, OUTLOOK, APPLE, CALDAV |
| `name` | String | Calendar display name |
| `externalId` | String | External calendar ID |
| `isEnabled` | Boolean | Use for availability checking |
| `syncStatus` | CalendarSyncStatus | Sync state |
| `lastSyncedAt` | DateTime? | Last sync timestamp |
| `userId` | String | Owner user ID |

**Relations:** user, credential, syncedEvents

### CalendarCredential
OAuth tokens for calendar providers.

| Field | Type | Description |
|-------|------|-------------|
| `accessToken` | String | OAuth access token |
| `refreshToken` | String? | OAuth refresh token |
| `expiresAt` | DateTime? | Token expiry |
| `tokenType` | String? | Token type |
| `scope` | String? | Granted scopes |
| `email` | String? | Provider email |
| `teamsCapable` | Boolean | Microsoft Teams support |
| `calendarId` | String (unique) | Linked calendar |

### CalendarSyncedEvent
External calendar events synced for availability checking.

| Field | Type | Description |
|-------|------|-------------|
| `externalEventId` | String | Provider event ID |
| `title` | String? | Event title |
| `startTime` | DateTime | Event start |
| `endTime` | DateTime | Event end |
| `status` | String? | Event status |
| `calendarId` | String | Parent calendar |

### ZoomCredential
Zoom OAuth credentials per user.

| Field | Type | Description |
|-------|------|-------------|
| `accessToken` | String | Zoom access token |
| `refreshToken` | String | Zoom refresh token |
| `expiresAt` | DateTime | Token expiry |
| `zoomUserId` | String? | Zoom user ID |
| `zoomEmail` | String? | Zoom account email |
| `userId` | String (unique) | Owner user ID |

### Team
Team organization for group scheduling.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (cuid) | Primary key |
| `name` | String | Team name |
| `slug` | String (unique) | URL slug |
| `logo` | Bytes? | Team logo binary |
| `logoMimeType` | String? | Logo MIME type |

**Relations:** members, eventTypes, invitations, auditLogs

### TeamMember
Team membership with role-based access.

| Field | Type | Description |
|-------|------|-------------|
| `role` | TeamMemberRole | OWNER, ADMIN, MEMBER |
| `priority` | Int | Scheduling priority (default: 0) |
| `userId` | String | Member user ID |
| `teamId` | String | Team ID |

**Unique:** (userId, teamId)

### TeamInvitation
Pending team invitation records.

| Field | Type | Description |
|-------|------|-------------|
| `email` | String | Invitee email |
| `role` | TeamMemberRole | Invited role |
| `status` | InvitationStatus | PENDING, ACCEPTED, DECLINED, EXPIRED |
| `token` | String (unique) | Invitation token |
| `expiresAt` | DateTime | Expiry date |
| `teamId` | String | Team ID |
| `invitedById` | String | Inviter user ID |

### TeamAuditLog
Team activity audit trail.

| Field | Type | Description |
|-------|------|-------------|
| `action` | String | Action performed |
| `details` | Json? | Action details |
| `teamId` | String | Team ID |
| `userId` | String | Actor user ID |

### EventTypeAssignment
Team member assignments to team event types.

| Field | Type | Description |
|-------|------|-------------|
| `priority` | Int | Assignment priority |
| `eventTypeId` | String | Event type ID |
| `userId` | String | Member user ID |

**Unique:** (eventTypeId, userId)

### Webhook
Webhook endpoint configuration.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (cuid) | Primary key |
| `url` | String | HTTPS endpoint URL |
| `secret` | String | HMAC-SHA256 signing secret |
| `events` | String[] | Subscribed event types |
| `name` | String? | Webhook display name |
| `isActive` | Boolean | Active flag |
| `lockedByDowngrade` | Boolean | Locked due to plan downgrade |
| `consecutiveFailures` | Int | Failure counter (auto-disable at 50) |
| `eventTriggers` | String[] | Subscribed event types |
| `userId` | String | Owner user ID |

**Relations:** user, deliveries

### WebhookDelivery
Webhook delivery attempt records.

| Field | Type | Description |
|-------|------|-------------|
| `event` | String | Event type |
| `payload` | Json | Delivered payload |
| `status` | WebhookDeliveryStatus | PENDING, SUCCESS, FAILED, RETRYING |
| `statusCode` | Int? | HTTP response code |
| `response` | String? | Response body |
| `attempts` | Int | Delivery attempts |
| `webhookId` | String | Parent webhook |

### Notification
In-app notification records.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (cuid) | Primary key |
| `type` | NotificationType | Notification category |
| `title` | String | Notification title |
| `message` | String | Notification body |
| `isRead` | Boolean | Read status |
| `bookingId` | String? | Related booking |
| `teamId` | String? | Related team |
| `userId` | String | Recipient user ID |

### SubscriptionHistory
Tracks all subscription state changes for audit.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (cuid) | Primary key |
| `action` | String | upgrade, downgrade, unsubscribe, grace_start, locked, reactivate, cleanup |
| `fromPlan` | String | Previous plan |
| `toPlan` | String | New plan |
| `fromStatus` | String | Previous subscription status |
| `toStatus` | String | New subscription status |
| `reason` | String? | Human-readable reason |
| `initiatedBy` | String | user, system, or admin:{adminId} |
| `metadata` | Json? | Additional context (grace days, target plan, etc.) |
| `userId` | String | User ID |
| `createdAt` | DateTime | When the change occurred |

### SupportTicket
User support tickets.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (cuid) | Primary key |
| `subject` | String | Ticket subject |
| `status` | TicketStatus | OPEN, IN_PROGRESS, RESOLVED, CLOSED |
| `priority` | TicketPriority | LOW, MEDIUM, HIGH, URGENT |
| `userId` | String | Creator user ID |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update |

### SupportTicketMessage
Messages within support tickets.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (cuid) | Primary key |
| `content` | String | Message content |
| `isAdminReply` | Boolean | Whether from admin |
| `ticketId` | String | Parent ticket |
| `userId` | String | Author user ID |
| `createdAt` | DateTime | Send timestamp |

### AdminAuditLog
Tracks all admin panel actions.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (cuid) | Primary key |
| `action` | String | Action performed (UPDATE_USER, DELETE_USER, etc.) |
| `targetType` | String | Entity type (User, Team, etc.) |
| `targetId` | String | Entity ID |
| `details` | Json? | Action details |
| `adminId` | String | Admin user ID |
| `createdAt` | DateTime | Action timestamp |

## Enums

### UserPlan
```
FREE | PRO | TEAM
```

### CalendarProvider
```
GOOGLE | OUTLOOK | APPLE | CALDAV
```

### CalendarSyncStatus
```
PENDING | SYNCED | SYNCING | ERROR | DISCONNECTED
```

### LocationType
```
IN_PERSON | PHONE | GOOGLE_MEET | ZOOM | TEAMS | CUSTOM
```

### SchedulingType
```
ROUND_ROBIN | COLLECTIVE | MANAGED
```

### BookingStatus
```
PENDING | CONFIRMED | CANCELLED | REJECTED | COMPLETED | SKIPPED
```

### TeamMemberRole
```
OWNER | ADMIN | MEMBER
```

### QuestionType
```
TEXT | TEXTAREA | NUMBER | SELECT | MULTISELECT | CHECKBOX | PHONE | EMAIL
```

### InvitationStatus
```
PENDING | ACCEPTED | DECLINED | EXPIRED
```

### WebhookDeliveryStatus
```
PENDING | SUCCESS | FAILED | RETRYING
```

### UserRole
```
USER | ADMIN
```

### NotificationType
```
BOOKING_CREATED | BOOKING_CONFIRMED | BOOKING_REJECTED | BOOKING_CANCELLED |
BOOKING_RESCHEDULED | BOOKING_REMINDER | TEAM_MEMBER_ADDED | TEAM_INVITATION_RECEIVED |
PLAN_ACTIVATED | PLAN_REACTIVATED | PLAN_DOWNGRADED | PLAN_EXPIRING |
PLAN_LOCKED | PLAN_CLEANUP_WARNING
```

### TicketStatus
```
OPEN | IN_PROGRESS | RESOLVED | CLOSED
```

### TicketPriority
```
LOW | MEDIUM | HIGH | URGENT
```

## Migration History

| Migration | Description |
|-----------|-------------|
| `20251218160220_init` | Initial schema (users, events, bookings, calendars) |
| `20260108091837_add_zoom_credentials` | Zoom integration support |
| `20260130093553_add_team_scheduling_fields` | Team scheduling (round-robin, collective) |
| `20260130135239_add_onboarding_completed` | User onboarding tracking |
| `20260208205138_add_timezone_auto_detect` | Timezone auto-detection |
| `20260209154403_add_user_plan` | UserPlan enum (FREE/PRO/TEAM) |
| `20260211113030_add_notifications` | In-app notifications |
| `20260219120000_add_avatar_data` | Binary avatar storage |
| `20260224120000_add_reschedule_fields` | Booking reschedule tracking |
| `20260224130000_add_teams_capable_field` | Teams meeting capability |
| `20260226112235_add_team_enhancements` | Team invitations, audit logs |
| `20260227082316_add_recurring_v2_fields` | Enhanced recurring bookings |
| `20260305000000_add_admin_panel` | Admin role, audit log, support tickets, impersonation |
| `20260310000000_add_webhooks_enhancements` | Webhook name, lockedByDowngrade, event triggers |
| `20260317000000_subscription_lifecycle` | Stripe fields, subscription status, grace period, subscription history, locked resources |

## Key Indexes

- `User.email` - Unique
- `User.username` - Unique
- `EventType.(userId, slug)` - Unique compound
- `Booking.uid` - Unique
- `BookingAnalytics.(date, userId)` - Unique compound
- `TeamMember.(userId, teamId)` - Unique compound
- `EventTypeAssignment.(eventTypeId, userId)` - Unique compound
- `Team.slug` - Unique
- `TeamInvitation.token` - Unique
- `CalendarCredential.calendarId` - Unique
- `ZoomCredential.userId` - Unique

---

*Last updated: March 2026*
