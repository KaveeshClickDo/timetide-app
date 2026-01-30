/**
 * Webhook Queue
 *
 * BullMQ-based webhook delivery queue with automatic retries.
 * Ensures webhooks are delivered reliably with HMAC signature verification.
 */

import { Queue, Worker, Job } from 'bullmq';
import { redis, isRedisAvailable } from './redis';
import prisma from '../prisma';
import crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export type WebhookEventType =
  | 'booking.created'
  | 'booking.cancelled'
  | 'booking.rescheduled'
  | 'booking.confirmed'
  | 'booking.rejected';

export interface WebhookPayload {
  event: WebhookEventType;
  createdAt: string;
  data: {
    booking?: {
      id: string;
      uid: string;
      status: string;
      startTime: string;
      endTime: string;
      timezone: string;
      location?: string | null;
      meetingUrl?: string | null;
      invitee: {
        name: string;
        email: string;
        phone?: string | null;
        notes?: string | null;
      };
      eventType: {
        id: string;
        title: string;
        slug: string;
        length: number;
      };
      host: {
        id: string;
        name: string | null;
        email: string;
      };
      responses?: Record<string, unknown>;
    };
    previousStartTime?: string;
    previousEndTime?: string;
    cancellationReason?: string;
    rejectionReason?: string;
  };
}

export interface WebhookJobData {
  webhookId: string;
  deliveryId: string;
  url: string;
  secret?: string | null;
  payload: WebhookPayload;
  attempt: number;
}

// ============================================================================
// Queue Configuration
// ============================================================================

const QUEUE_NAME = 'webhook-delivery';

const defaultJobOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential' as const,
    delay: 10000, // Start with 10 seconds, then 20s, 40s, 80s, 160s
  },
  removeOnComplete: {
    age: 7 * 24 * 60 * 60, // Keep completed jobs for 7 days
    count: 5000,
  },
  removeOnFail: {
    age: 30 * 24 * 60 * 60, // Keep failed jobs for 30 days
  },
};

// ============================================================================
// Queue Instance
// ============================================================================

let webhookQueue: Queue<WebhookJobData> | null = null;
let webhookWorker: Worker<WebhookJobData> | null = null;

/**
 * Get or create the webhook queue instance
 */
export async function getWebhookQueue(): Promise<Queue<WebhookJobData> | null> {
  if (webhookQueue) return webhookQueue;

  const available = await isRedisAvailable();
  if (!available) {
    console.warn('Redis not available, webhook queue disabled');
    return null;
  }

  webhookQueue = new Queue<WebhookJobData>(QUEUE_NAME, {
    connection: redis,
    defaultJobOptions,
  });

  return webhookQueue;
}

/**
 * Initialize the webhook worker
 */
export async function initWebhookWorker(): Promise<void> {
  if (webhookWorker) return;

  const available = await isRedisAvailable();
  if (!available) {
    console.warn('Redis not available, webhook worker not started');
    return;
  }

  webhookWorker = new Worker<WebhookJobData>(
    QUEUE_NAME,
    async (job: Job<WebhookJobData>) => {
      await processWebhookJob(job);
    },
    {
      connection: redis,
      concurrency: 10, // Process up to 10 webhooks concurrently
    }
  );

  webhookWorker.on('completed', (job) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`Webhook job ${job.id} completed: ${job.data.payload.event}`);
    }
  });

  webhookWorker.on('failed', (job, err) => {
    console.error(`Webhook job ${job?.id} failed:`, err.message);
  });

  console.log('Webhook worker initialized');
}

// ============================================================================
// HMAC Signature Generation
// ============================================================================

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// ============================================================================
// Job Processing
// ============================================================================

/**
 * Process a webhook delivery job
 */
async function processWebhookJob(job: Job<WebhookJobData>): Promise<void> {
  const { webhookId, deliveryId, url, secret, payload, attempt } = job.data;

  const startTime = Date.now();
  let responseStatus: number | undefined;
  let responseBody: string | undefined;
  let errorMessage: string | undefined;

  try {
    // Update delivery status to retrying if not first attempt
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: attempt > 1 ? 'RETRYING' : 'PENDING',
        attempts: attempt,
      },
    });

    // Prepare request headers
    const payloadString = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'TimeTide-Webhook/1.0',
      'X-Webhook-Event': payload.event,
      'X-Webhook-Delivery': deliveryId,
      'X-Webhook-Timestamp': new Date().toISOString(),
    };

    // Add signature if secret is configured
    if (secret) {
      const timestamp = Date.now();
      const signaturePayload = `${timestamp}.${payloadString}`;
      const signature = generateSignature(signaturePayload, secret);
      headers['X-Webhook-Signature'] = `t=${timestamp},v1=${signature}`;
    }

    // Make the HTTP request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    responseStatus = response.status;
    responseBody = await response.text().catch(() => '');

    // Check if response is successful (2xx status codes)
    if (response.ok) {
      const responseTimeMs = Date.now() - startTime;

      // Update delivery as successful
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'SUCCESS',
          responseStatus,
          responseBody: responseBody?.substring(0, 5000), // Limit stored response
          responseTimeMs,
          deliveredAt: new Date(),
          errorMessage: null,
        },
      });

      // Update webhook health
      await prisma.webhook.update({
        where: { id: webhookId },
        data: {
          failureCount: 0,
          lastTriggeredAt: new Date(),
          lastSuccessAt: new Date(),
          lastErrorMessage: null,
        },
      });

      return;
    }

    // Non-2xx response - throw to trigger retry
    errorMessage = `HTTP ${responseStatus}: ${responseBody?.substring(0, 500)}`;
    throw new Error(errorMessage);
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    errorMessage = error instanceof Error ? error.message : 'Unknown error';

    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 5) - 1;

    // Update delivery record
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: isLastAttempt ? 'FAILED' : 'RETRYING',
        responseStatus,
        responseBody: responseBody?.substring(0, 5000),
        responseTimeMs,
        errorMessage,
        nextRetryAt: isLastAttempt ? null : new Date(Date.now() + calculateBackoff(attempt)),
      },
    });

    // Update webhook health
    await prisma.webhook.update({
      where: { id: webhookId },
      data: {
        failureCount: { increment: 1 },
        lastTriggeredAt: new Date(),
        lastFailureAt: new Date(),
        lastErrorMessage: errorMessage,
      },
    });

    // Auto-disable webhook after too many consecutive failures
    const webhook = await prisma.webhook.findUnique({
      where: { id: webhookId },
      select: { failureCount: true },
    });

    if (webhook && webhook.failureCount >= 50) {
      await prisma.webhook.update({
        where: { id: webhookId },
        data: { isActive: false },
      });
      console.warn(`Webhook ${webhookId} auto-disabled after ${webhook.failureCount} failures`);
    }

    // Re-throw to trigger BullMQ retry
    throw error;
  }
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoff(attempt: number): number {
  return Math.min(10000 * Math.pow(2, attempt - 1), 3600000); // Max 1 hour
}

// ============================================================================
// Webhook Trigger Functions
// ============================================================================

/**
 * Trigger webhooks for an event
 */
export async function triggerWebhooks(
  userId: string,
  eventType: WebhookEventType,
  data: WebhookPayload['data']
): Promise<void> {
  // Find all active webhooks for this user that subscribe to this event
  const webhooks = await prisma.webhook.findMany({
    where: {
      userId,
      isActive: true,
      eventTriggers: { has: eventType },
    },
  });

  if (webhooks.length === 0) return;

  const payload: WebhookPayload = {
    event: eventType,
    createdAt: new Date().toISOString(),
    data,
  };

  const queue = await getWebhookQueue();

  for (const webhook of webhooks) {
    // Create delivery record
    const delivery = await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        eventType,
        payload: payload as object,
        status: 'PENDING',
        maxAttempts: 5,
      },
    });

    const jobData: WebhookJobData = {
      webhookId: webhook.id,
      deliveryId: delivery.id,
      url: webhook.url,
      secret: webhook.secret,
      payload,
      attempt: 1,
    };

    if (queue) {
      await queue.add(`${eventType}-${webhook.id}-${delivery.id}`, jobData, {
        jobId: delivery.id,
      });
    } else {
      // Fallback to direct delivery
      await processWebhookDirect(jobData);
    }
  }
}

/**
 * Direct webhook processing (fallback when queue unavailable)
 */
async function processWebhookDirect(data: WebhookJobData): Promise<void> {
  try {
    const job = {
      data,
      attemptsMade: 0,
      opts: { attempts: 1 },
    } as Job<WebhookJobData>;
    await processWebhookJob(job);
  } catch (error) {
    console.error('Direct webhook delivery failed:', error);
  }
}

// ============================================================================
// Convenience Functions for Booking Events
// ============================================================================

/**
 * Build webhook payload from booking data
 */
export function buildBookingWebhookPayload(booking: {
  id: string;
  uid: string;
  status: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  location?: string | null;
  meetingUrl?: string | null;
  inviteeName: string;
  inviteeEmail: string;
  inviteePhone?: string | null;
  inviteeNotes?: string | null;
  responses?: Record<string, unknown> | null;
  eventType: {
    id: string;
    title: string;
    slug: string;
    length: number;
  };
  host: {
    id: string;
    name: string | null;
    email: string;
  };
}): WebhookPayload['data'] {
  return {
    booking: {
      id: booking.id,
      uid: booking.uid,
      status: booking.status,
      startTime: booking.startTime.toISOString(),
      endTime: booking.endTime.toISOString(),
      timezone: booking.timezone,
      location: booking.location,
      meetingUrl: booking.meetingUrl,
      invitee: {
        name: booking.inviteeName,
        email: booking.inviteeEmail,
        phone: booking.inviteePhone,
        notes: booking.inviteeNotes,
      },
      eventType: {
        id: booking.eventType.id,
        title: booking.eventType.title,
        slug: booking.eventType.slug,
        length: booking.eventType.length,
      },
      host: {
        id: booking.host.id,
        name: booking.host.name,
        email: booking.host.email,
      },
      responses: booking.responses ?? undefined,
    },
  };
}

/**
 * Trigger booking.created webhook
 */
export async function triggerBookingCreatedWebhook(
  hostId: string,
  booking: Parameters<typeof buildBookingWebhookPayload>[0]
): Promise<void> {
  const data = buildBookingWebhookPayload(booking);
  await triggerWebhooks(hostId, 'booking.created', data);
}

/**
 * Trigger booking.cancelled webhook
 */
export async function triggerBookingCancelledWebhook(
  hostId: string,
  booking: Parameters<typeof buildBookingWebhookPayload>[0],
  reason?: string
): Promise<void> {
  const data = buildBookingWebhookPayload(booking);
  data.cancellationReason = reason;
  await triggerWebhooks(hostId, 'booking.cancelled', data);
}

/**
 * Trigger booking.rescheduled webhook
 */
export async function triggerBookingRescheduledWebhook(
  hostId: string,
  booking: Parameters<typeof buildBookingWebhookPayload>[0],
  previousStartTime: Date,
  previousEndTime: Date
): Promise<void> {
  const data = buildBookingWebhookPayload(booking);
  data.previousStartTime = previousStartTime.toISOString();
  data.previousEndTime = previousEndTime.toISOString();
  await triggerWebhooks(hostId, 'booking.rescheduled', data);
}

/**
 * Trigger booking.confirmed webhook
 */
export async function triggerBookingConfirmedWebhook(
  hostId: string,
  booking: Parameters<typeof buildBookingWebhookPayload>[0]
): Promise<void> {
  const data = buildBookingWebhookPayload(booking);
  await triggerWebhooks(hostId, 'booking.confirmed', data);
}

/**
 * Trigger booking.rejected webhook
 */
export async function triggerBookingRejectedWebhook(
  hostId: string,
  booking: Parameters<typeof buildBookingWebhookPayload>[0],
  reason?: string
): Promise<void> {
  const data = buildBookingWebhookPayload(booking);
  data.rejectionReason = reason;
  await triggerWebhooks(hostId, 'booking.rejected', data);
}

// ============================================================================
// Retry Failed Deliveries
// ============================================================================

/**
 * Retry a specific failed delivery
 */
export async function retryWebhookDelivery(deliveryId: string): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhook: true },
  });

  if (!delivery) {
    throw new Error('Delivery not found');
  }

  if (delivery.status === 'SUCCESS') {
    throw new Error('Cannot retry successful delivery');
  }

  // Reset delivery status
  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: 'PENDING',
      attempts: 0,
      errorMessage: null,
      responseStatus: null,
      responseBody: null,
      responseTimeMs: null,
      nextRetryAt: null,
    },
  });

  const queue = await getWebhookQueue();

  const jobData: WebhookJobData = {
    webhookId: delivery.webhookId,
    deliveryId: delivery.id,
    url: delivery.webhook.url,
    secret: delivery.webhook.secret,
    payload: delivery.payload as unknown as WebhookPayload,
    attempt: 1,
  };

  if (queue) {
    await queue.add(`retry-${delivery.id}`, jobData, {
      jobId: `retry-${delivery.id}-${Date.now()}`,
    });
  } else {
    await processWebhookDirect(jobData);
  }
}

/**
 * Test webhook by sending a test payload
 */
export async function testWebhook(webhookId: string): Promise<{
  success: boolean;
  statusCode?: number;
  responseTime?: number;
  error?: string;
}> {
  const webhook = await prisma.webhook.findUnique({
    where: { id: webhookId },
  });

  if (!webhook) {
    throw new Error('Webhook not found');
  }

  const testPayload: WebhookPayload = {
    event: 'booking.created',
    createdAt: new Date().toISOString(),
    data: {
      booking: {
        id: 'test-booking-id',
        uid: 'test-booking-uid',
        status: 'CONFIRMED',
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 3600000).toISOString(),
        timezone: 'UTC',
        location: 'Test Location',
        meetingUrl: 'https://meet.example.com/test',
        invitee: {
          name: 'Test User',
          email: 'test@example.com',
          phone: null,
          notes: 'This is a test webhook',
        },
        eventType: {
          id: 'test-event-type-id',
          title: 'Test Event',
          slug: 'test-event',
          length: 30,
        },
        host: {
          id: 'test-host-id',
          name: 'Test Host',
          email: 'host@example.com',
        },
      },
    },
  };

  const startTime = Date.now();

  try {
    const payloadString = JSON.stringify(testPayload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'TimeTide-Webhook/1.0',
      'X-Webhook-Event': 'test',
      'X-Webhook-Test': 'true',
    };

    if (webhook.secret) {
      const timestamp = Date.now();
      const signaturePayload = `${timestamp}.${payloadString}`;
      const signature = generateSignature(signaturePayload, webhook.secret);
      headers['X-Webhook-Signature'] = `t=${timestamp},v1=${signature}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseTime = Date.now() - startTime;

    return {
      success: response.ok,
      statusCode: response.status,
      responseTime,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      success: false,
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
