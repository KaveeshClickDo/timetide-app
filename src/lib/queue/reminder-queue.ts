/**
 * Reminder Queue
 *
 * Schedules and processes reminder emails for upcoming bookings.
 * Reminders are sent 24 hours and 1 hour before the meeting.
 */

import { Queue, Worker, Job } from 'bullmq';
import { addHours, subHours, format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { redis, isRedisAvailable } from './redis';
import { queueReminderEmail } from './email-queue';
import prisma from '../prisma';
import { BookingEmailData } from '../email/client';

// ============================================================================
// Types
// ============================================================================

export interface ReminderJobData {
  bookingId: string;
  bookingUid: string;
  hoursUntil: number; // 24 or 1
}

// ============================================================================
// Queue Configuration
// ============================================================================

const QUEUE_NAME = 'reminder-queue';

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000, // 5 seconds initial delay
  },
  removeOnComplete: {
    age: 24 * 60 * 60, // 24 hours
    count: 500,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60, // 7 days
  },
};

// ============================================================================
// Queue Instance
// ============================================================================

let reminderQueue: Queue<ReminderJobData> | null = null;
let reminderWorker: Worker<ReminderJobData> | null = null;

/**
 * Get or create the reminder queue instance
 */
export async function getReminderQueue(): Promise<Queue<ReminderJobData> | null> {
  if (reminderQueue) return reminderQueue;

  const available = await isRedisAvailable();
  if (!available) {
    console.warn('Redis not available, reminder queue disabled');
    return null;
  }

  reminderQueue = new Queue<ReminderJobData>(QUEUE_NAME, {
    connection: redis,
    defaultJobOptions,
  });

  return reminderQueue;
}

/**
 * Initialize the reminder worker
 */
export async function initReminderWorker(): Promise<void> {
  if (reminderWorker) return;

  const available = await isRedisAvailable();
  if (!available) {
    console.warn('Redis not available, reminder worker not started');
    return;
  }

  reminderWorker = new Worker<ReminderJobData>(
    QUEUE_NAME,
    async (job: Job<ReminderJobData>) => {
      await processReminderJob(job);
    },
    {
      connection: redis,
      concurrency: 10,
    }
  );

  reminderWorker.on('completed', (job) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`Reminder job ${job.id} completed for booking ${job.data.bookingUid}`);
    }
  });

  reminderWorker.on('failed', (job, err) => {
    console.error(`Reminder job ${job?.id} failed:`, err.message);
  });

  console.log('Reminder worker initialized');
}

// ============================================================================
// Job Processing
// ============================================================================

/**
 * Process a reminder job
 */
async function processReminderJob(job: Job<ReminderJobData>): Promise<void> {
  const { bookingId, bookingUid, hoursUntil } = job.data;

  // Fetch the booking with all needed relations
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      eventType: {
        select: {
          title: true,
          description: true,
        },
      },
      host: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  if (!booking) {
    console.warn(`Booking ${bookingId} not found for reminder`);
    return;
  }

  // Don't send reminder if booking is cancelled
  if (booking.status === 'CANCELLED' || booking.status === 'REJECTED') {
    console.log(`Skipping reminder for cancelled/rejected booking ${bookingUid}`);
    return;
  }

  // Don't send reminder if the meeting already started
  if (booking.startTime <= new Date()) {
    console.log(`Skipping reminder for past booking ${bookingUid}`);
    return;
  }

  // Build email data
  const emailData: BookingEmailData = {
    hostName: booking.host.name ?? 'Host',
    hostEmail: booking.host.email!,
    inviteeName: booking.inviteeName,
    inviteeEmail: booking.inviteeEmail,
    eventTitle: booking.eventType.title,
    eventDescription: booking.eventType.description ?? undefined,
    startTime: formatInTimeZone(booking.startTime, booking.timezone, 'EEEE, MMMM d, yyyy h:mm a'),
    endTime: formatInTimeZone(booking.endTime, booking.timezone, 'h:mm a'),
    timezone: booking.timezone,
    location: booking.location ?? undefined,
    meetingUrl: booking.meetingUrl ?? undefined,
    bookingUid: booking.uid,
  };

  // Queue the reminder email
  await queueReminderEmail(emailData, hoursUntil);

  // Also send reminder to host for 1-hour reminder
  if (hoursUntil === 1) {
    const hostEmailData: BookingEmailData = {
      ...emailData,
      // Swap so host sees their own upcoming meeting
      startTime: formatInTimeZone(booking.startTime, booking.host.email ? 'UTC' : booking.timezone, 'EEEE, MMMM d, yyyy h:mm a'),
    };

    await queueReminderEmail(hostEmailData, hoursUntil);
  }
}

// ============================================================================
// Schedule Reminders
// ============================================================================

/**
 * Schedule reminders for a booking
 * Called when a booking is created or confirmed
 *
 * @param bookingId - The booking ID
 * @param bookingUid - The booking UID (public-facing)
 * @param startTime - The booking start time
 */
export async function scheduleBookingReminders(
  bookingId: string,
  bookingUid: string,
  startTime: Date
): Promise<void> {
  const queue = await getReminderQueue();
  if (!queue) {
    console.warn('Reminder queue not available, skipping reminder scheduling');
    return;
  }

  const now = new Date();

  // Schedule 24-hour reminder
  const reminder24h = subHours(startTime, 24);
  if (reminder24h > now) {
    const delay = reminder24h.getTime() - now.getTime();
    await queue.add(
      `reminder-24h-${bookingUid}`,
      {
        bookingId,
        bookingUid,
        hoursUntil: 24,
      },
      {
        delay,
        jobId: `reminder-24h-${bookingUid}`, // Prevent duplicates
      }
    );

    if (process.env.NODE_ENV === 'development') {
      console.log(`Scheduled 24h reminder for booking ${bookingUid} at ${reminder24h.toISOString()}`);
    }
  }

  // Schedule 1-hour reminder
  const reminder1h = subHours(startTime, 1);
  if (reminder1h > now) {
    const delay = reminder1h.getTime() - now.getTime();
    await queue.add(
      `reminder-1h-${bookingUid}`,
      {
        bookingId,
        bookingUid,
        hoursUntil: 1,
      },
      {
        delay,
        jobId: `reminder-1h-${bookingUid}`, // Prevent duplicates
      }
    );

    if (process.env.NODE_ENV === 'development') {
      console.log(`Scheduled 1h reminder for booking ${bookingUid} at ${reminder1h.toISOString()}`);
    }
  }
}

/**
 * Cancel scheduled reminders for a booking
 * Called when a booking is cancelled
 *
 * @param bookingUid - The booking UID
 */
export async function cancelBookingReminders(bookingUid: string): Promise<void> {
  const queue = await getReminderQueue();
  if (!queue) return;

  try {
    // Remove both reminder jobs
    await queue.remove(`reminder-24h-${bookingUid}`);
    await queue.remove(`reminder-1h-${bookingUid}`);

    if (process.env.NODE_ENV === 'development') {
      console.log(`Cancelled reminders for booking ${bookingUid}`);
    }
  } catch (error) {
    // Jobs might not exist, that's okay
    if (process.env.NODE_ENV === 'development') {
      console.log(`No reminders to cancel for booking ${bookingUid}`);
    }
  }
}

/**
 * Reschedule reminders for a booking
 * Called when a booking is rescheduled
 *
 * @param bookingId - The booking ID
 * @param bookingUid - The booking UID
 * @param newStartTime - The new start time
 */
export async function rescheduleBookingReminders(
  bookingId: string,
  bookingUid: string,
  newStartTime: Date
): Promise<void> {
  // Cancel existing reminders
  await cancelBookingReminders(bookingUid);

  // Schedule new reminders
  await scheduleBookingReminders(bookingId, bookingUid, newStartTime);
}

// ============================================================================
// Batch Operations (for system maintenance)
// ============================================================================

/**
 * Schedule reminders for all upcoming confirmed bookings
 * Useful for system startup or recovering from downtime
 */
export async function scheduleAllPendingReminders(): Promise<number> {
  const queue = await getReminderQueue();
  if (!queue) return 0;

  const now = new Date();
  const maxFuture = addHours(now, 25); // Only bookings within next 25 hours need reminders now

  // Find all confirmed bookings that haven't started yet
  const bookings = await prisma.booking.findMany({
    where: {
      status: { in: ['CONFIRMED', 'PENDING'] },
      startTime: {
        gt: now,
        lt: maxFuture,
      },
    },
    select: {
      id: true,
      uid: true,
      startTime: true,
    },
  });

  let scheduled = 0;

  for (const booking of bookings) {
    try {
      await scheduleBookingReminders(booking.id, booking.uid, booking.startTime);
      scheduled++;
    } catch (error) {
      console.error(`Failed to schedule reminders for booking ${booking.uid}:`, error);
    }
  }

  console.log(`Scheduled reminders for ${scheduled} bookings`);
  return scheduled;
}
