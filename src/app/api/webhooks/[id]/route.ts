/**
 * /api/webhooks/[id]
 * GET: Get webhook details with recent deliveries
 * PATCH: Update webhook
 * DELETE: Delete webhook
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/admin-auth';
import prisma from '@/server/db/prisma';
import crypto from 'crypto';
import { checkNumericLimit, checkSubscriptionNotLocked } from '@/server/billing/plan-enforcement';
import { updateWebhookSchema } from '@/server/validation/schemas';
import type { PlanTier } from '@/lib/pricing';

/**
 * GET /api/webhooks/[id]
 * Get webhook details with recent deliveries
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, session } = await requireAuth();
    if (error) return error;

    const { id } = await params;

    const webhook = await prisma.webhook.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 25,
          select: {
            id: true,
            eventType: true,
            status: true,
            attempts: true,
            responseStatus: true,
            responseTimeMs: true,
            errorMessage: true,
            deliveredAt: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            deliveries: true,
          },
        },
      },
    });

    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    // Get delivery stats
    const [totalSuccess, totalFailed, totalPending] = await Promise.all([
      prisma.webhookDelivery.count({
        where: { webhookId: id, status: 'SUCCESS' },
      }),
      prisma.webhookDelivery.count({
        where: { webhookId: id, status: 'FAILED' },
      }),
      prisma.webhookDelivery.count({
        where: { webhookId: id, status: { in: ['PENDING', 'RETRYING'] } },
      }),
    ]);

    return NextResponse.json({
      webhook: {
        ...webhook,
        totalDeliveries: webhook._count.deliveries,
        stats: {
          success: totalSuccess,
          failed: totalFailed,
          pending: totalPending,
        },
      },
    });
  } catch (error) {
    console.error('GET webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/webhooks/[id]
 * Update webhook
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, session } = await requireAuth();
    if (error) return error;

    const { id } = await params;

    // Verify ownership
    const existing = await prisma.webhook.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const result = updateWebhookSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { name, url, eventTriggers, isActive, regenerateSecret } = result.data;

    // Check for duplicate URL if changing
    if (url && url !== existing.url) {
      const duplicateUrl = await prisma.webhook.findFirst({
        where: {
          userId: session.user.id,
          url,
          id: { not: id },
        },
      });

      if (duplicateUrl) {
        return NextResponse.json(
          { error: 'A webhook with this URL already exists' },
          { status: 400 }
        );
      }
    }

    // Build update data
    const updateData: {
      name?: string | null;
      url?: string;
      eventTriggers?: string[];
      isActive?: boolean;
      secret?: string;
      failureCount?: number;
    } = {};

    if (name !== undefined) updateData.name = name;
    if (url !== undefined) updateData.url = url;
    if (eventTriggers !== undefined) updateData.eventTriggers = eventTriggers;
    if (isActive !== undefined) {
      updateData.isActive = isActive;
      // Enforce plan limit when re-enabling a webhook
      if (isActive && !existing.isActive) {
        // Read plan and subscription status from DB (not session) to prevent stale JWT bypass
        const dbUser = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { plan: true, subscriptionStatus: true },
        });
        const plan = (dbUser?.plan as PlanTier) || 'FREE';

        // Block LOCKED users from re-enabling webhooks
        const lockedDenied = checkSubscriptionNotLocked(dbUser?.subscriptionStatus);
        if (lockedDenied) return lockedDenied;

        const activeCount = await prisma.webhook.count({
          where: { userId: session.user.id, isActive: true, id: { not: id } },
        });
        const limitDenied = checkNumericLimit(plan, 'maxWebhooks', activeCount);
        if (limitDenied) return limitDenied;
        updateData.failureCount = 0;
      }
    }
    if (regenerateSecret) {
      updateData.secret = crypto.randomBytes(32).toString('hex');
    }

    const webhook = await prisma.webhook.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        url: true,
        secret: regenerateSecret ? true : false,
        eventTriggers: true,
        isActive: true,
        failureCount: true,
        lastTriggeredAt: true,
        lastSuccessAt: true,
        lastFailureAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ webhook });
  } catch (error) {
    console.error('PATCH webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/webhooks/[id]
 * Delete webhook
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, session } = await requireAuth();
    if (error) return error;

    const { id } = await params;

    // Verify ownership
    const existing = await prisma.webhook.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    await prisma.webhook.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
