/**
 * Next.js Instrumentation
 *
 * This file runs once when the Next.js server starts.
 * We use it to initialize queue workers for background job processing.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { initWorkers } = await import('@/lib/queue/worker');
      await initWorkers();
    } catch (error) {
      // Log but don't crash - the app can still work without workers
      console.error('Failed to initialize queue workers:', error);
      console.warn('The app will continue without background job processing.');
      console.warn('Emails will be sent directly, reminders will not be scheduled.');
    }
  }
}
