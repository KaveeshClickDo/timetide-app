/**
 * Email Queue
 *
 * BullMQ-based email queue with automatic retries.
 * Ensures emails are delivered reliably even if the first attempt fails.
 */

import { Queue, Worker, Job } from 'bullmq';
import { redis, isRedisAvailable } from './redis';
import {
  sendEmail,
  EmailOptions,
  BookingEmailData,
  generateBookingConfirmedEmail,
  generateBookingCancelledEmail,
  generateBookingPendingEmail,
  generateBookingConfirmedByHostEmail,
  generateBookingRejectedEmail,
  generateReminderEmail,
  generateBookingRescheduledEmail,
} from '../email/client';

// ============================================================================
// Types
// ============================================================================

export type EmailJobType =
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_pending'
  | 'booking_confirmed_by_host'
  | 'booking_rejected'
  | 'booking_reminder'
  | 'booking_rescheduled'
  | 'custom';

export interface EmailJobData {
  type: EmailJobType;
  to: string;
  subject: string;
  bookingData?: BookingEmailData;
  isHost?: boolean;
  reason?: string;
  hoursUntil?: number;
  customHtml?: string;
  replyTo?: string;
  oldTime?: { start: string; end: string };
}

// ============================================================================
// Queue Configuration
// ============================================================================

const QUEUE_NAME = 'email-queue';

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000, // Start with 1 second, then 2s, 4s
  },
  removeOnComplete: {
    age: 24 * 60 * 60, // Keep completed jobs for 24 hours
    count: 1000, // Keep last 1000 completed jobs
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
  },
};

// ============================================================================
// Queue Instance
// ============================================================================

let emailQueue: Queue<EmailJobData> | null = null;
let emailWorker: Worker<EmailJobData> | null = null;

/**
 * Get or create the email queue instance
 */
export async function getEmailQueue(): Promise<Queue<EmailJobData> | null> {
  if (emailQueue) return emailQueue;

  const available = await isRedisAvailable();
  if (!available) {
    console.warn('Redis not available, email queue disabled');
    return null;
  }

  emailQueue = new Queue<EmailJobData>(QUEUE_NAME, {
    connection: redis,
    defaultJobOptions,
  });

  return emailQueue;
}

/**
 * Initialize the email worker (call this in a worker process or during server startup)
 */
export async function initEmailWorker(): Promise<void> {
  if (emailWorker) return;

  const available = await isRedisAvailable();
  if (!available) {
    console.warn('Redis not available, email worker not started');
    return;
  }

  emailWorker = new Worker<EmailJobData>(
    QUEUE_NAME,
    async (job: Job<EmailJobData>) => {
      await processEmailJob(job);
    },
    {
      connection: redis,
      concurrency: 5, // Process up to 5 emails concurrently
    }
  );

  emailWorker.on('completed', (job) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`Email job ${job.id} completed: ${job.data.type} to ${job.data.to}`);
    }
  });

  emailWorker.on('failed', (job, err) => {
    console.error(`Email job ${job?.id} failed:`, err.message);
  });

  console.log('Email worker initialized');
}

// ============================================================================
// Job Processing
// ============================================================================

/**
 * Process an email job
 */
async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { type, to, subject, bookingData, isHost, reason, hoursUntil, customHtml, replyTo } = job.data;

  let html: string;

  switch (type) {
    case 'booking_confirmed':
      if (!bookingData) throw new Error('Missing bookingData for booking_confirmed');
      html = generateBookingConfirmedEmail(bookingData, isHost ?? false);
      break;

    case 'booking_cancelled':
      if (!bookingData) throw new Error('Missing bookingData for booking_cancelled');
      html = generateBookingCancelledEmail(bookingData, isHost ?? false, reason);
      break;

    case 'booking_pending':
      if (!bookingData) throw new Error('Missing bookingData for booking_pending');
      html = generateBookingPendingEmail(bookingData, isHost ?? false);
      break;

    case 'booking_confirmed_by_host':
      if (!bookingData) throw new Error('Missing bookingData for booking_confirmed_by_host');
      html = generateBookingConfirmedByHostEmail(bookingData);
      break;

    case 'booking_rejected':
      if (!bookingData) throw new Error('Missing bookingData for booking_rejected');
      html = generateBookingRejectedEmail(bookingData, reason);
      break;

    case 'booking_reminder':
      if (!bookingData) throw new Error('Missing bookingData for booking_reminder');
      html = generateReminderEmail(bookingData, hoursUntil ?? 24);
      break;

    case 'booking_rescheduled':
      if (!bookingData) throw new Error('Missing bookingData for booking_rescheduled');
      if (!job.data.oldTime) throw new Error('Missing oldTime for booking_rescheduled');
      html = generateBookingRescheduledEmail(bookingData, job.data.oldTime, isHost ?? false);
      break;

    case 'custom':
      if (!customHtml) throw new Error('Missing customHtml for custom email');
      html = customHtml;
      break;

    default:
      throw new Error(`Unknown email type: ${type}`);
  }

  const emailOptions: EmailOptions = {
    to,
    subject,
    html,
    replyTo,
  };

  const success = await sendEmail(emailOptions);

  if (!success) {
    throw new Error(`Failed to send email to ${to}`);
  }
}

// ============================================================================
// Queue Email Functions (with fallback to direct send)
// ============================================================================

/**
 * Queue an email for sending
 * Falls back to direct sending if Redis is unavailable
 */
export async function queueEmail(data: EmailJobData): Promise<void> {
  const queue = await getEmailQueue();

  if (queue) {
    await queue.add(`${data.type}-${Date.now()}`, data);
  } else {
    // Fallback to direct sending
    await processEmailJobDirect(data);
  }
}

/**
 * Direct email processing (fallback when queue unavailable)
 */
async function processEmailJobDirect(data: EmailJobData): Promise<void> {
  try {
    const job = { data } as Job<EmailJobData>;
    await processEmailJob(job);
  } catch (error) {
    console.error('Direct email send failed:', error);
    // Don't throw - this is fire-and-forget in fallback mode
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Queue booking confirmation emails (to both host and invitee)
 */
export async function queueBookingConfirmationEmails(data: BookingEmailData): Promise<void> {
  // Queue email to invitee
  await queueEmail({
    type: 'booking_confirmed',
    to: data.inviteeEmail,
    subject: `Confirmed: ${data.eventTitle} with ${data.hostName}`,
    bookingData: data,
    isHost: false,
    replyTo: data.hostEmail,
  });

  // Queue email to host
  await queueEmail({
    type: 'booking_confirmed',
    to: data.hostEmail,
    subject: `New Booking: ${data.eventTitle} with ${data.inviteeName}`,
    bookingData: data,
    isHost: true,
    replyTo: data.inviteeEmail,
  });
}

/**
 * Queue booking cancellation emails
 */
export async function queueBookingCancellationEmails(
  data: BookingEmailData,
  reason?: string,
  cancelledByHost: boolean = false
): Promise<void> {
  const recipient = cancelledByHost ? data.inviteeEmail : data.hostEmail;
  const subject = cancelledByHost
    ? `Cancelled: ${data.eventTitle} - ${data.hostName} cancelled`
    : `Cancelled: ${data.eventTitle} - ${data.inviteeName} cancelled`;

  await queueEmail({
    type: 'booking_cancelled',
    to: recipient,
    subject,
    bookingData: data,
    isHost: !cancelledByHost,
    reason,
  });
}

/**
 * Queue booking pending emails (for events requiring confirmation)
 */
export async function queueBookingPendingEmails(data: BookingEmailData): Promise<void> {
  // Queue email to invitee
  await queueEmail({
    type: 'booking_pending',
    to: data.inviteeEmail,
    subject: `Pending: ${data.eventTitle} with ${data.hostName} - Awaiting Confirmation`,
    bookingData: data,
    isHost: false,
    replyTo: data.hostEmail,
  });

  // Queue email to host
  await queueEmail({
    type: 'booking_pending',
    to: data.hostEmail,
    subject: `Action Required: New booking request from ${data.inviteeName}`,
    bookingData: data,
    isHost: true,
    replyTo: data.inviteeEmail,
  });
}

/**
 * Queue booking confirmed by host email (to invitee)
 */
export async function queueBookingConfirmedByHostEmail(data: BookingEmailData): Promise<void> {
  await queueEmail({
    type: 'booking_confirmed_by_host',
    to: data.inviteeEmail,
    subject: `Confirmed: ${data.eventTitle} with ${data.hostName}`,
    bookingData: data,
    replyTo: data.hostEmail,
  });
}

/**
 * Queue booking rejected email (to invitee)
 */
export async function queueBookingRejectedEmail(
  data: BookingEmailData,
  reason?: string
): Promise<void> {
  await queueEmail({
    type: 'booking_rejected',
    to: data.inviteeEmail,
    subject: `Declined: ${data.eventTitle} with ${data.hostName}`,
    bookingData: data,
    reason,
    replyTo: data.hostEmail,
  });
}

/**
 * Queue reminder email
 */
export async function queueReminderEmail(
  data: BookingEmailData,
  hoursUntil: number
): Promise<void> {
  await queueEmail({
    type: 'booking_reminder',
    to: data.inviteeEmail,
    subject: `Reminder: ${data.eventTitle} with ${data.hostName} in ${hoursUntil === 1 ? '1 hour' : `${hoursUntil} hours`}`,
    bookingData: data,
    hoursUntil,
    replyTo: data.hostEmail,
  });
}

/**
 * Queue booking rescheduled emails (to both host and invitee)
 */
export async function queueBookingRescheduledEmails(
  data: BookingEmailData,
  oldTime: { start: string; end: string },
  hostOldTime: { start: string; end: string },
  rescheduledByHost: boolean = false,
  reason?: string
): Promise<void> {
  // Always notify the invitee
  await queueEmail({
    type: 'booking_rescheduled',
    to: data.inviteeEmail,
    subject: `Rescheduled: ${data.eventTitle} with ${data.hostName}`,
    bookingData: data,
    isHost: false,
    oldTime,
    reason,
    replyTo: data.hostEmail,
  });

  // Notify host if invitee rescheduled
  if (!rescheduledByHost) {
    await queueEmail({
      type: 'booking_rescheduled',
      to: data.hostEmail,
      subject: `Rescheduled: ${data.eventTitle} - ${data.inviteeName} changed time`,
      bookingData: data,
      isHost: true,
      oldTime: hostOldTime,
      reason,
      replyTo: data.inviteeEmail,
    });
  }
}
