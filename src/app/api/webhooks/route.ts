/**
 * /api/webhooks
 * GET: List user's webhooks
 * POST: Create a new webhook
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { createWebhookSchema } from '@/lib/validation/schemas';
import crypto from 'crypto';

/**
 * GET /api/webhooks
 * List all webhooks for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    });

    // Get recent delivery stats for each webhook
    const webhooksWithStats = await Promise.all(
      webhooks.map(async (webhook) => {
        const [successCount, failedCount] = await Promise.all([
          prisma.webhookDelivery.count({
            where: {
              webhookId: webhook.id,
              status: 'SUCCESS',
              createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
          }),
          prisma.webhookDelivery.count({
            where: {
              webhookId: webhook.id,
              status: 'FAILED',
              createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
          }),
        ]);

        return {
          ...webhook,
          totalDeliveries: webhook._count.deliveries,
          recentStats: {
            success: successCount,
            failed: failedCount,
          },
        };
      })
    );

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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // Check webhook limit (max 10 per user)
    const existingCount = await prisma.webhook.count({
      where: { userId: session.user.id },
    });

    if (existingCount >= 10) {
      return NextResponse.json(
        { error: 'Maximum webhook limit (10) reached' },
        { status: 400 }
      );
    }

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
