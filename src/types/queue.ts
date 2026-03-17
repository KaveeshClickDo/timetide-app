// Centralized queue/job types

import type { BookingEmailData, RecurringBookingEmailData, TeamEmailData } from './email'

// ============================================================================
// EMAIL QUEUE
// ============================================================================

export type EmailJobType =
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_pending'
  | 'booking_confirmed_by_host'
  | 'booking_rejected'
  | 'booking_reminder'
  | 'booking_rescheduled'
  | 'recurring_booking_confirmed'
  | 'bulk_confirmed_by_host'
  | 'team_member_added'
  | 'team_invitation'
  | 'plan_expiring_warning'
  | 'grace_period_started'
  | 'grace_period_ending'
  | 'plan_locked'
  | 'cleanup_warning'
  | 'plan_cleanup_complete'
  | 'admin_downgrade_notice'
  | 'plan_reactivated'
  | 'custom'

export interface PlanEmailData {
  userName: string
  userEmail: string
  currentPlan: string
  newPlan?: string
  expiresAt?: string
  gracePeriodEndsAt?: string
  cleanupScheduledAt?: string
  lockedEventCount?: number
  lockedWebhookCount?: number
  reactivateUrl: string
}

export interface EmailJobData {
  type: EmailJobType
  to: string
  subject: string
  bookingData?: BookingEmailData
  recurringBookingData?: RecurringBookingEmailData
  teamData?: TeamEmailData & { expiresIn?: string; acceptUrl?: string }
  planData?: PlanEmailData
  isHost?: boolean
  reason?: string
  hoursUntil?: number
  customHtml?: string
  replyTo?: string
  oldTime?: { start: string; end: string }
}

// ============================================================================
// WEBHOOK QUEUE
// ============================================================================

export type WebhookEventType =
  | 'booking.created'
  | 'booking.cancelled'
  | 'booking.rescheduled'
  | 'booking.confirmed'
  | 'booking.rejected'

export interface WebhookPayload {
  event: WebhookEventType
  createdAt: string
  data: {
    booking?: {
      id: string
      uid: string
      status: string
      startTime: string
      endTime: string
      timezone: string
      location?: string | null
      meetingUrl?: string | null
      invitee: {
        name: string
        email: string
        phone?: string | null
        notes?: string | null
      }
      eventType: {
        id: string
        title: string
        slug: string
        length: number
      }
      host: {
        id: string
        name: string | null
        email: string
      }
      responses?: Record<string, unknown>
    }
    previousStartTime?: string
    previousEndTime?: string
    cancellationReason?: string
    rejectionReason?: string
  }
}

export interface WebhookJobData {
  webhookId: string
  deliveryId: string
  url: string
  secret?: string | null
  payload: WebhookPayload
  attempt: number
}

// ============================================================================
// REMINDER QUEUE
// ============================================================================

export interface ReminderJobData {
  bookingId: string
  bookingUid: string
  hoursUntil: number
}

// ============================================================================
// CALENDAR SYNC QUEUE
// ============================================================================

export type CalendarSyncJobType =
  | 'sync_calendar'
  | 'refresh_tokens'
  | 'verify_health'
  | 'sync_all_calendars'

export interface CalendarSyncJobData {
  type: CalendarSyncJobType
  calendarId?: string
  userId?: string
  forceFullSync?: boolean
}

// ============================================================================
// RATE LIMITER
// ============================================================================

export interface RateLimitConfig {
  limit: number
  windowSeconds: number
  prefix?: string
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  limit: number
}

// ============================================================================
// SUBSCRIPTION QUEUE
// ============================================================================

export type SubscriptionJobType =
  | 'check_expirations'
  | 'check_grace_periods'
  | 'check_cleanups'
  | 'send_warning'

export interface SubscriptionJobData {
  type: SubscriptionJobType
  userId?: string          // For user-specific jobs like send_warning
  warningType?: string     // For send_warning: 'expiring' | 'grace_ending' | 'cleanup_warning'
}
