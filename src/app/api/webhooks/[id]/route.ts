/**
 * /api/webhooks/[id]
 * GET: Get webhook details with recent deliveries
 * PATCH: Update webhook
 * DELETE: Delete webhook
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import crypto from 'crypto';

const updateWebhookSchema = z.object({
  name: z.string().max(100).optional().nullable(),
  url: z.string().url().optional(),
  eventTriggers: z
    .array(
      z.enum([
        'booking.created',
        'booking.cancelled',
        'booking.rescheduled',
        'booking.confirmed',
        'booking.rejected',
      ])
    )
    .min(1)
    .optional(),
  isActive: z.boolean().optional(),
  regenerateSecret: z.boolean().optional(),
});

/**
 * GET /api/webhooks/[id]
 * Get webhook details with recent deliveries
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
      // Reset failure count when re-enabling
      if (isActive && !existing.isActive) {
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
