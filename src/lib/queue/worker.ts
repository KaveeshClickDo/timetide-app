/**
 * Queue Worker Initialization
 *
 * This file initializes all BullMQ workers for background job processing.
 * Import this file in your server startup to enable:
 * - Email sending with retries
 * - Reminder scheduling
 *
 * Usage:
 *   In your app initialization (e.g., instrumentation.ts or a custom server):
 *
 *   import { initWorkers } from '@/lib/queue/worker';
 *   await initWorkers();
 *
 * For Next.js, you can use the instrumentation.ts file:
 *
 *   // instrumentation.ts
 *   export async function register() {
 *     if (process.env.NEXT_RUNTIME === 'nodejs') {
 *       const { initWorkers } = await import('@/lib/queue/worker');
 *       await initWorkers();
 *     }
 *   }
 */

import { isRedisAvailable } from './redis';
import { initEmailWorker } from './email-queue';
import { initReminderWorker, scheduleAllPendingReminders } from './reminder-queue';

let initialized = false;

/**
 * Initialize all queue workers
 */
export async function initWorkers(): Promise<void> {
  if (initialized) {
    console.log('Workers already initialized');
    return;
  }

  const available = await isRedisAvailable();
  if (!available) {
    console.warn('Redis not available. Queue workers will not be started.');
    console.warn('Emails will be sent directly without retries.');
    console.warn('Reminders will not be scheduled.');
    return;
  }

  console.log('Initializing queue workers...');

  try {
    // Initialize email worker
    await initEmailWorker();

    // Initialize reminder worker
    await initReminderWorker();

    // Schedule any pending reminders (for recovery after restart)
    const scheduledCount = await scheduleAllPendingReminders();
    console.log(`Recovered ${scheduledCount} pending reminders`);

    initialized = true;
    console.log('All queue workers initialized successfully');
  } catch (error) {
    console.error('Failed to initialize queue workers:', error);
    throw error;
  }
}

/**
 * Check if workers are initialized
 */
export function areWorkersInitialized(): boolean {
  return initialized;
}

// Auto-initialize in development if running directly
if (process.env.NODE_ENV === 'development' && require.main === module) {
  initWorkers()
    .then(() => console.log('Workers started in standalone mode'))
    .catch(console.error);
}
