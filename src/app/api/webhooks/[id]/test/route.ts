/**
 * /api/webhooks/[id]/test
 * POST: Send a test webhook to verify endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/admin-auth';
import prisma from '@/server/db/prisma';
import { testWebhook } from '@/server/infrastructure/queue';

/**
 * POST /api/webhooks/[id]/test
 * Send a test webhook
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, session } = await requireAuth();
    if (error) return error;

    const { id } = await params;

    // Verify ownership
    const webhook = await prisma.webhook.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    // Send test webhook
    const result = await testWebhook(id);

    return NextResponse.json({
      success: result.success,
      statusCode: result.statusCode,
      responseTime: result.responseTime,
      error: result.error,
    });
  } catch (error) {
    console.error('POST webhook test error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
