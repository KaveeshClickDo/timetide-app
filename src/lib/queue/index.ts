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

// ============================================================================
// Worker Initialization
// ============================================================================

/**
 * Initialize all queue workers
 * Call this during server startup
 */
export async function initAllWorkers(): Promise<void> {
  const { initEmailWorker } = await import('./email-queue');
  const { initReminderWorker } = await import('./reminder-queue');
  const { initCalendarSyncWorker, scheduleCalendarSyncJobs } = await import('./calendar-sync-queue');
  const { initWebhookWorker } = await import('./webhook-queue');

  await Promise.all([
    initEmailWorker(),
    initReminderWorker(),
    initCalendarSyncWorker(),
    initWebhookWorker(),
  ]);

  // Schedule recurring calendar sync jobs
  await scheduleCalendarSyncJobs();

  console.log('All queue workers initialized');
}
