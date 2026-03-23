/**
 * /api/webhooks
 * GET: List user's webhooks
 * POST: Create a new webhook
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/admin-auth';
import prisma from '@/server/db/prisma';
import { createWebhookSchema } from '@/server/validation/schemas';
import crypto from 'crypto';
import { checkNumericLimit, checkSubscriptionNotLocked } from '@/server/billing/plan-enforcement';
import { MAX_LIST_LIMIT } from '@/server/api-constants';
import type { PlanTier } from '@/lib/pricing';

/**
 * GET /api/webhooks
 * List all webhooks for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const { error, session } = await requireAuth();
    if (error) return error;

    const webhooks = await prisma.webhook.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        name: true,
        url: true,
        eventTriggers: true,
        isActive: true,
        failureCount: true,
        lastTriggeredAt: true,
        lastSuccessAt: true,
        lastFailureAt: true,
        lastErrorMessage: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            deliveries: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_LIST_LIMIT,
    });

    // Get recent delivery stats for all webhooks in 2 queries (instead of 2N)
    const webhookIds = webhooks.map((w) => w.id);
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [successGroups, failedGroups] = await Promise.all([
      prisma.webhookDelivery.groupBy({
        by: ['webhookId'],
        where: { webhookId: { in: webhookIds }, status: 'SUCCESS', createdAt: { gte: last24h } },
        _count: { webhookId: true },
      }),
      prisma.webhookDelivery.groupBy({
        by: ['webhookId'],
        where: { webhookId: { in: webhookIds }, status: 'FAILED', createdAt: { gte: last24h } },
        _count: { webhookId: true },
      }),
    ]);

    const successMap = new Map(successGroups.map((g) => [g.webhookId, g._count.webhookId]));
    const failedMap = new Map(failedGroups.map((g) => [g.webhookId, g._count.webhookId]));

    const webhooksWithStats = webhooks.map((webhook) => ({
      ...webhook,
      totalDeliveries: webhook._count.deliveries,
      recentStats: {
        success: successMap.get(webhook.id) || 0,
        failed: failedMap.get(webhook.id) || 0,
      },
    }));

    return NextResponse.json({ webhooks: webhooksWithStats });
  } catch (error) {
    console.error('GET webhooks error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/webhooks
 * Create a new webhook
 */
export async function POST(request: NextRequest) {
  try {
    const { error, session } = await requireAuth();
    if (error) return error;

    const body = await request.json();
    const result = createWebhookSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { url, eventTriggers, secret: providedSecret } = result.data;
    const name = body.name;

    // Read plan and subscription status from DB (not session) to prevent stale JWT bypass
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true, subscriptionStatus: true },
    });
    const plan = (dbUser?.plan as PlanTier) || 'FREE';

    // Block LOCKED users from creating resources
    const lockedDenied = checkSubscriptionNotLocked(dbUser?.subscriptionStatus);
    if (lockedDenied) return lockedDenied;

    const existingCount = await prisma.webhook.count({
      where: { userId: session.user.id },
    });
    const limitDenied = checkNumericLimit(plan, 'maxWebhooks', existingCount);
    if (limitDenied) return limitDenied;

    // Check for duplicate URL
    const existingUrl = await prisma.webhook.findFirst({
      where: {
        userId: session.user.id,
        url,
      },
    });

    if (existingUrl) {
      return NextResponse.json(
        { error: 'A webhook with this URL already exists' },
        { status: 400 }
      );
    }

    // Generate a secret if not provided
    const secret = providedSecret || crypto.randomBytes(32).toString('hex');

    const webhook = await prisma.webhook.create({
      data: {
        userId: session.user.id,
        name: name || null,
        url,
        secret,
        eventTriggers,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        url: true,
        secret: true,
        eventTriggers: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ webhook }, { status: 201 });
  } catch (error) {
    console.error('POST webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
