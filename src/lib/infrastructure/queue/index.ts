/**
 * Queue Module Exports
 *
 * Central export point for all queue-related functionality.
 */

// Redis client
export { redis, isRedisAvailable, closeRedis } from './redis';

// Rate limiting
export {
  checkRateLimit,
  checkBookingRateLimit,
  checkSlotsRateLimit,
  checkAuthRateLimit,
  checkApiRateLimit,
  type RateLimitConfig,
  type RateLimitResult,
} from './rate-limiter';

// Email queue
export {
  getEmailQueue,
  initEmailWorker,
  queueEmail,
  queueBookingConfirmationEmails,
  queueBookingCancellationEmails,
  queueBookingPendingEmails,
  queueBookingConfirmedByHostEmail,
  queueBookingRejectedEmail,
  queueReminderEmail,
  queueBookingRescheduledEmails,
  queueRecurringBookingConfirmationEmails,
  queueBulkConfirmedByHostEmail,
  type EmailJobData,
  type EmailJobType,
} from './email-queue';

// Reminder queue
export {
  getReminderQueue,
  initReminderWorker,
  scheduleBookingReminders,
  cancelBookingReminders,
  rescheduleBookingReminders,
  scheduleAllPendingReminders,
  type ReminderJobData,
} from './reminder-queue';

// Calendar sync queue
export {
  getCalendarSyncQueue,
  initCalendarSyncWorker,
  scheduleCalendarSyncJobs,
  triggerUserCalendarSync,
  triggerCalendarSync,
  checkCalendarConflicts,
  type CalendarSyncJobData,
  type CalendarSyncJobType,
  type ConflictResult,
} from './calendar-sync-queue';

// Webhook queue
export {
  getWebhookQueue,
  initWebhookWorker,
  triggerWebhooks,
  triggerBookingCreatedWebhook,
  triggerBookingCancelledWebhook,
  triggerBookingRescheduledWebhook,
  triggerBookingConfirmedWebhook,
  triggerBookingRejectedWebhook,
  buildBookingWebhookPayload,
  retryWebhookDelivery,
  testWebhook,
  type WebhookEventType,
  type WebhookPayload,
  type WebhookJobData,
} from './webhook-queue';

// Worker initialization is handled by src/lib/queue/worker.ts via initWorkers()
