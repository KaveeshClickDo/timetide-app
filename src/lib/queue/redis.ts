/**
 * Redis Client Singleton
 *
 * Provides a shared Redis connection for:
 * - Rate limiting
 * - Job queues (BullMQ)
 * - Caching
 */

import Redis from 'ioredis';

declare global {
  var redis: Redis | undefined;
}

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Get or create a Redis client instance
 * Uses singleton pattern to prevent multiple connections in development
 */
function getRedisClient(): Redis {
  if (process.env.NODE_ENV === 'production') {
    return new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => {
        if (times > 3) {
          console.error('Redis connection failed after 3 retries');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });
  }

  // In development, reuse connection across hot reloads
  if (!global.redis) {
    global.redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });
  }

  return global.redis;
}

export const redis = getRedisClient();

/**
 * Check if Redis is available
 */
export async function isRedisAvailable(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Gracefully close Redis connection
 */
export async function closeRedis(): Promise<void> {
  try {
    await redis.quit();
  } catch {
    redis.disconnect();
  }
}

export default redis;
