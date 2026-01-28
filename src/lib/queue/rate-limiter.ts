/**
 * Rate Limiter
 *
 * Redis-backed rate limiting with in-memory fallback.
 * Uses sliding window algorithm for accurate rate limiting.
 */

import { redis, isRedisAvailable } from './redis';

// In-memory fallback for when Redis is unavailable
const memoryStore = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Prefix for Redis keys */
  prefix?: string;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of remaining requests in the current window */
  remaining: number;
  /** Unix timestamp when the rate limit resets */
  resetAt: number;
  /** Total limit for the window */
  limit: number;
}

/**
 * Check rate limit for a given identifier
 *
 * @param identifier - Unique identifier (e.g., IP address, user ID)
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const { limit, windowSeconds, prefix = 'ratelimit' } = config;
  const key = `${prefix}:${identifier}`;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const resetAt = now + windowMs;

  // Try Redis first
  const redisAvailable = await isRedisAvailable();

  if (redisAvailable) {
    return checkRateLimitRedis(key, limit, windowSeconds, now);
  }

  // Fall back to in-memory
  return checkRateLimitMemory(key, limit, windowMs, now);
}

/**
 * Redis-backed rate limiting using sliding window
 */
async function checkRateLimitRedis(
  key: string,
  limit: number,
  windowSeconds: number,
  now: number
): Promise<RateLimitResult> {
  const windowMs = windowSeconds * 1000;
  const windowStart = now - windowMs;

  // Use Redis pipeline for atomic operations
  const pipeline = redis.pipeline();

  // Remove old entries outside the window
  pipeline.zremrangebyscore(key, 0, windowStart);

  // Count current requests in window
  pipeline.zcard(key);

  // Add current request
  pipeline.zadd(key, now.toString(), `${now}-${Math.random()}`);

  // Set expiry on the key
  pipeline.expire(key, windowSeconds + 1);

  const results = await pipeline.exec();

  // Get the count before adding current request
  const currentCount = (results?.[1]?.[1] as number) || 0;
  const allowed = currentCount < limit;
  const remaining = Math.max(0, limit - currentCount - (allowed ? 1 : 0));

  // Get the oldest entry to determine reset time
  const oldestEntry = await redis.zrange(key, 0, 0, 'WITHSCORES');
  const resetAt = oldestEntry.length >= 2
    ? parseInt(oldestEntry[1]) + windowMs
    : now + windowMs;

  // If not allowed, remove the request we just added
  if (!allowed) {
    await redis.zremrangebyscore(key, now, now);
  }

  return {
    allowed,
    remaining,
    resetAt,
    limit,
  };
}

/**
 * In-memory rate limiting fallback
 */
function checkRateLimitMemory(
  key: string,
  limit: number,
  windowMs: number,
  now: number
): RateLimitResult {
  const record = memoryStore.get(key);

  // Clean up old entries periodically
  if (memoryStore.size > 10000) {
    cleanupMemoryStore(now);
  }

  if (!record || now > record.resetAt) {
    // Start new window
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: now + windowMs,
      limit,
    };
  }

  if (record.count >= limit) {
    // Rate limit exceeded
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.resetAt,
      limit,
    };
  }

  // Increment count
  record.count++;
  return {
    allowed: true,
    remaining: limit - record.count,
    resetAt: record.resetAt,
    limit,
  };
}

/**
 * Clean up expired entries from memory store
 */
function cleanupMemoryStore(now: number): void {
  const entries = Array.from(memoryStore.entries());
  for (const [key, record] of entries) {
    if (now > record.resetAt) {
      memoryStore.delete(key);
    }
  }
}

// ============================================================================
// Pre-configured rate limiters for common use cases
// ============================================================================

/**
 * Rate limiter for booking creation
 * 5 bookings per minute per IP
 */
export async function checkBookingRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(ip, {
    limit: 5,
    windowSeconds: 60,
    prefix: 'booking',
  });
}

/**
 * Rate limiter for slot queries
 * 30 requests per minute per IP
 */
export async function checkSlotsRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(ip, {
    limit: 30,
    windowSeconds: 60,
    prefix: 'slots',
  });
}

/**
 * Rate limiter for authentication attempts
 * 5 attempts per 5 minutes per IP
 */
export async function checkAuthRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(ip, {
    limit: 5,
    windowSeconds: 300,
    prefix: 'auth',
  });
}

/**
 * Rate limiter for API endpoints
 * 100 requests per minute per IP
 */
export async function checkApiRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(ip, {
    limit: 100,
    windowSeconds: 60,
    prefix: 'api',
  });
}
