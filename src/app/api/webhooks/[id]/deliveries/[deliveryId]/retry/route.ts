/**
 * /api/webhooks/[id]/deliveries/[deliveryId]/retry
 * POST: Retry a failed webhook delivery
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/admin-auth';
import prisma from '@/server/db/prisma';
import { retryWebhookDelivery } from '@/server/infrastructure/queue';

/**
 * POST /api/webhooks/[id]/deliveries/[deliveryId]/retry
 * Retry a failed delivery
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; deliveryId: string }> }
) {
  try {
    const { error, session } = await requireAuth();
    if (error) return error;

    const { id, deliveryId } = await params;

    // Verify ownership and delivery exists
    const delivery = await prisma.webhookDelivery.findFirst({
      where: {
        id: deliveryId,
        webhookId: id,
        webhook: {
          userId: session.user.id,
        },
      },
      include: {
        webhook: {
          select: { isActive: true },
        },
      },
    });

    if (!delivery) {
      return NextResponse.json(
        { error: 'Delivery not found' },
        { status: 404 }
      );
    }

    if (delivery.status === 'SUCCESS') {
      return NextResponse.json(
        { error: 'Cannot retry successful delivery' },
        { status: 400 }
      );
    }

    if (!delivery.webhook.isActive) {
      return NextResponse.json(
        { error: 'Cannot retry delivery for disabled webhook' },
        { status: 400 }
      );
    }

    // Trigger retry
    await retryWebhookDelivery(deliveryId);

    return NextResponse.json({
      success: true,
      message: 'Retry queued',
    });
  } catch (error) {
    console.error('POST webhook delivery retry error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
