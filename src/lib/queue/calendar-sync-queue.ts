/**
 * Calendar Sync Queue
 * Handles background calendar synchronization jobs
 */

import { Queue, Worker, Job } from 'bullmq';
import { redis, isRedisAvailable } from './redis';
import prisma from '../prisma';
import { refreshAccessToken, getGoogleBusyTimes } from '../calendar/google';
import { refreshOutlookAccessToken, getOutlookBusyTimes } from '../calendar/outlook';
import { addHours, addMinutes, subHours, isAfter, isBefore } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

export type CalendarSyncJobType =
  | 'sync_calendar'
  | 'refresh_tokens'
  | 'verify_health'
  | 'sync_all_calendars';

export interface CalendarSyncJobData {
  type: CalendarSyncJobType;
  calendarId?: string;
  userId?: string;
  forceFullSync?: boolean;
}

interface SyncedEvent {
  externalEventId: string;
  title: string | null;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  isBusy: boolean;
}

// ============================================================================
// Queue Setup
// ============================================================================

let calendarSyncQueue: Queue<CalendarSyncJobData> | null = null;
let calendarSyncWorker: Worker<CalendarSyncJobData> | null = null;

const QUEUE_NAME = 'calendar-sync';

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000, // Start with 5s, then 10s, then 20s
  },
  removeOnComplete: {
    age: 24 * 60 * 60, // Keep completed jobs for 24 hours
    count: 500,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
  },
};

export async function getCalendarSyncQueue(): Promise<Queue<CalendarSyncJobData> | null> {
  if (calendarSyncQueue) return calendarSyncQueue;

  const available = await isRedisAvailable();
  if (!available) {
    console.warn('Redis not available for calendar sync queue');
    return null;
  }

  calendarSyncQueue = new Queue<CalendarSyncJobData>(QUEUE_NAME, {
    connection: redis,
    defaultJobOptions,
  });

  return calendarSyncQueue;
}

// ============================================================================
// Job Processing
// ============================================================================

async function processCalendarSyncJob(job: Job<CalendarSyncJobData>): Promise<void> {
  const { type, calendarId, userId, forceFullSync } = job.data;

  switch (type) {
    case 'sync_calendar':
      if (!calendarId) throw new Error('calendarId required for sync_calendar');
      await syncSingleCalendar(calendarId, forceFullSync);
      break;

    case 'refresh_tokens':
      await refreshExpiringTokens();
      break;

    case 'verify_health':
      await verifyCalendarHealth();
      break;

    case 'sync_all_calendars':
      await syncAllCalendars(userId);
      break;

    default:
      throw new Error(`Unknown job type: ${type}`);
  }
}

// ============================================================================
// Sync Functions
// ============================================================================

/**
 * Sync a single calendar - fetch events and detect conflicts
 */
async function syncSingleCalendar(calendarId: string, forceFullSync: boolean = false): Promise<void> {
  const calendar = await prisma.calendar.findUnique({
    where: { id: calendarId },
    include: { credentials: true },
  });

  if (!calendar) {
    throw new Error(`Calendar ${calendarId} not found`);
  }

  if (!calendar.isEnabled) {
    return; // Skip disabled calendars
  }

  // Mark as syncing
  await prisma.calendar.update({
    where: { id: calendarId },
    data: { syncStatus: 'SYNCING' },
  });

  try {
    // Define sync window (next 60 days for busy times)
    const now = new Date();
    const syncStart = subHours(now, 1); // Include recent past for overlap detection
    const syncEnd = addHours(now, 60 * 24); // 60 days ahead

    let busyTimes: Array<{ start: Date; end: Date }> = [];

    // Fetch busy times based on provider
    if (calendar.provider === 'GOOGLE') {
      busyTimes = await getGoogleBusyTimes(calendarId, syncStart, syncEnd);
    } else if (calendar.provider === 'OUTLOOK') {
      busyTimes = await getOutlookBusyTimes(calendarId, syncStart, syncEnd);
    }

    // Convert busy times to synced events format
    // Note: Busy times API doesn't give us event IDs, so we use time-based IDs
    const syncedEvents: SyncedEvent[] = busyTimes.map((bt, index) => ({
      externalEventId: `busy-${bt.start.getTime()}-${bt.end.getTime()}`,
      title: null, // Busy times don't include titles
      startTime: bt.start,
      endTime: bt.end,
      isAllDay: false,
      isBusy: true,
    }));

    // Clear old synced events and insert new ones (for simplicity with busy times)
    // In a more advanced implementation, we'd use incremental sync with syncToken
    if (forceFullSync || !calendar.syncToken) {
      await prisma.calendarSyncedEvent.deleteMany({
        where: { calendarId },
      });

      if (syncedEvents.length > 0) {
        await prisma.calendarSyncedEvent.createMany({
          data: syncedEvents.map((event) => ({
            calendarId,
            ...event,
          })),
        });
      }
    }

    // Update calendar status
    await prisma.calendar.update({
      where: { id: calendarId },
      data: {
        syncStatus: 'SYNCED',
        lastSyncedAt: new Date(),
        lastSyncError: null,
      },
    });

    if (process.env.NODE_ENV === 'development') {
      console.log(`Calendar ${calendarId} synced: ${syncedEvents.length} busy periods`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check if it's a token error
    const isTokenError =
      errorMessage.includes('token') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('401');

    await prisma.calendar.update({
      where: { id: calendarId },
      data: {
        syncStatus: isTokenError ? 'DISCONNECTED' : 'ERROR',
        lastSyncError: errorMessage,
      },
    });

    throw error;
  }
}

/**
 * Proactively refresh tokens that are expiring soon
 */
async function refreshExpiringTokens(): Promise<void> {
  const expiringThreshold = addHours(new Date(), 1); // Tokens expiring within 1 hour

  // Find calendars with tokens expiring soon
  const calendarsToRefresh = await prisma.calendar.findMany({
    where: {
      isEnabled: true,
      credentials: {
        expiresAt: {
          lt: expiringThreshold,
          gt: new Date(), // Not already expired
        },
      },
    },
    include: { credentials: true },
  });

  if (process.env.NODE_ENV === 'development') {
    console.log(`Refreshing tokens for ${calendarsToRefresh.length} calendars`);
  }

  for (const calendar of calendarsToRefresh) {
    try {
      if (calendar.provider === 'GOOGLE') {
        await refreshAccessToken(calendar.id);
      } else if (calendar.provider === 'OUTLOOK') {
        await refreshOutlookAccessToken(calendar.id);
      }

      if (process.env.NODE_ENV === 'development') {
        console.log(`Refreshed token for calendar ${calendar.id}`);
      }
    } catch (error) {
      console.error(`Failed to refresh token for calendar ${calendar.id}:`, error);

      // Mark calendar as disconnected if refresh fails
      await prisma.calendar.update({
        where: { id: calendar.id },
        data: {
          syncStatus: 'DISCONNECTED',
          lastSyncError: error instanceof Error ? error.message : 'Token refresh failed',
        },
      });
    }
  }
}

/**
 * Verify health of all enabled calendars
 */
async function verifyCalendarHealth(): Promise<void> {
  const calendars = await prisma.calendar.findMany({
    where: { isEnabled: true },
    include: { credentials: true },
  });

  for (const calendar of calendars) {
    // Check if credentials exist
    if (!calendar.credentials) {
      await prisma.calendar.update({
        where: { id: calendar.id },
        data: {
          syncStatus: 'DISCONNECTED',
          lastSyncError: 'No credentials found',
        },
      });
      continue;
    }

    // Check if token is expired
    if (calendar.credentials.expiresAt && isBefore(calendar.credentials.expiresAt, new Date())) {
      // Try to refresh
      try {
        if (calendar.provider === 'GOOGLE') {
          await refreshAccessToken(calendar.id);
        } else if (calendar.provider === 'OUTLOOK') {
          await refreshOutlookAccessToken(calendar.id);
        }

        await prisma.calendar.update({
          where: { id: calendar.id },
          data: {
            syncStatus: 'SYNCED',
            lastSyncError: null,
          },
        });
      } catch (error) {
        await prisma.calendar.update({
          where: { id: calendar.id },
          data: {
            syncStatus: 'DISCONNECTED',
            lastSyncError: 'Token expired and refresh failed',
          },
        });
      }
    }
  }
}

/**
 * Sync all calendars for a user or all users
 */
async function syncAllCalendars(userId?: string): Promise<void> {
  const calendars = await prisma.calendar.findMany({
    where: {
      isEnabled: true,
      ...(userId ? { userId } : {}),
    },
  });

  const queue = await getCalendarSyncQueue();

  if (queue) {
    // Queue individual sync jobs
    for (const calendar of calendars) {
      await queue.add(
        `sync-${calendar.id}`,
        { type: 'sync_calendar', calendarId: calendar.id },
        { jobId: `sync-${calendar.id}-${Date.now()}` }
      );
    }
  } else {
    // Direct execution if queue not available
    for (const calendar of calendars) {
      try {
        await syncSingleCalendar(calendar.id);
      } catch (error) {
        console.error(`Failed to sync calendar ${calendar.id}:`, error);
      }
    }
  }
}

// ============================================================================
// Worker Initialization
// ============================================================================

export async function initCalendarSyncWorker(): Promise<void> {
  const available = await isRedisAvailable();
  if (!available) {
    console.warn('Redis not available. Calendar sync worker will not be started.');
    return;
  }

  calendarSyncWorker = new Worker<CalendarSyncJobData>(
    QUEUE_NAME,
    async (job) => {
      await processCalendarSyncJob(job);
    },
    {
      connection: redis,
      concurrency: 3, // Process up to 3 calendar syncs at a time
    }
  );

  calendarSyncWorker.on('completed', (job) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`Calendar sync job ${job.id} completed: ${job.data.type}`);
    }
  });

  calendarSyncWorker.on('failed', (job, err) => {
    console.error(`Calendar sync job ${job?.id} failed:`, err.message);
  });

  console.log('Calendar sync worker initialized');
}

// ============================================================================
// Scheduled Jobs Setup
// ============================================================================

export async function scheduleCalendarSyncJobs(): Promise<void> {
  const queue = await getCalendarSyncQueue();
  if (!queue) return;

  // Schedule recurring jobs using BullMQ's repeat feature

  // 1. Refresh expiring tokens every 30 minutes
  await queue.add(
    'refresh-tokens-recurring',
    { type: 'refresh_tokens' },
    {
      repeat: {
        pattern: '*/30 * * * *', // Every 30 minutes
      },
      jobId: 'refresh-tokens-recurring',
    }
  );

  // 2. Sync all calendars every hour
  await queue.add(
    'sync-all-recurring',
    { type: 'sync_all_calendars' },
    {
      repeat: {
        pattern: '0 * * * *', // Every hour at minute 0
      },
      jobId: 'sync-all-recurring',
    }
  );

  // 3. Verify calendar health daily
  await queue.add(
    'verify-health-recurring',
    { type: 'verify_health' },
    {
      repeat: {
        pattern: '0 3 * * *', // Daily at 3 AM
      },
      jobId: 'verify-health-recurring',
    }
  );

  console.log('Calendar sync scheduled jobs set up');
}

// ============================================================================
// Manual Trigger Functions (for API use)
// ============================================================================

/**
 * Trigger immediate sync for a user's calendars
 */
export async function triggerUserCalendarSync(userId: string): Promise<void> {
  const queue = await getCalendarSyncQueue();

  if (queue) {
    await queue.add(
      `sync-user-${userId}`,
      { type: 'sync_all_calendars', userId },
      { jobId: `sync-user-${userId}-${Date.now()}` }
    );
  } else {
    await syncAllCalendars(userId);
  }
}

/**
 * Trigger immediate sync for a specific calendar
 */
export async function triggerCalendarSync(calendarId: string, forceFullSync: boolean = false): Promise<void> {
  const queue = await getCalendarSyncQueue();

  if (queue) {
    await queue.add(
      `sync-${calendarId}`,
      { type: 'sync_calendar', calendarId, forceFullSync },
      { jobId: `sync-${calendarId}-${Date.now()}` }
    );
  } else {
    await syncSingleCalendar(calendarId, forceFullSync);
  }
}

// ============================================================================
// Conflict Detection
// ============================================================================

export interface ConflictResult {
  hasConflict: boolean;
  conflictingEvents: Array<{
    title: string | null;
    startTime: Date;
    endTime: Date;
    source: 'external' | 'booking';
  }>;
}

/**
 * Check for conflicts between a proposed time slot and synced calendar events
 */
export async function checkCalendarConflicts(
  userId: string,
  startTime: Date,
  endTime: Date
): Promise<ConflictResult> {
  const conflictingEvents: ConflictResult['conflictingEvents'] = [];

  // Get all synced events that overlap with the proposed time
  const syncedConflicts = await prisma.calendarSyncedEvent.findMany({
    where: {
      calendar: {
        userId,
        isEnabled: true,
      },
      isBusy: true,
      OR: [
        {
          // Event starts during proposed slot
          startTime: { gte: startTime, lt: endTime },
        },
        {
          // Event ends during proposed slot
          endTime: { gt: startTime, lte: endTime },
        },
        {
          // Event spans entire proposed slot
          AND: [
            { startTime: { lte: startTime } },
            { endTime: { gte: endTime } },
          ],
        },
      ],
    },
    include: {
      calendar: {
        select: { name: true },
      },
    },
  });

  for (const event of syncedConflicts) {
    conflictingEvents.push({
      title: event.title || `Busy (${event.calendar.name})`,
      startTime: event.startTime,
      endTime: event.endTime,
      source: 'external',
    });
  }

  // Also check existing bookings
  const bookingConflicts = await prisma.booking.findMany({
    where: {
      hostId: userId,
      status: { in: ['PENDING', 'CONFIRMED'] },
      OR: [
        {
          startTime: { gte: startTime, lt: endTime },
        },
        {
          endTime: { gt: startTime, lte: endTime },
        },
        {
          AND: [
            { startTime: { lte: startTime } },
            { endTime: { gte: endTime } },
          ],
        },
      ],
    },
    include: {
      eventType: {
        select: { title: true },
      },
    },
  });

  for (const booking of bookingConflicts) {
    conflictingEvents.push({
      title: `${booking.eventType.title} with ${booking.inviteeName}`,
      startTime: booking.startTime,
      endTime: booking.endTime,
      source: 'booking',
    });
  }

  return {
    hasConflict: conflictingEvents.length > 0,
    conflictingEvents,
  };
}
