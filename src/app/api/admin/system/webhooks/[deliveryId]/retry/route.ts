import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/admin-audit'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ deliveryId: string }> }
) {
  const { error, session } = await requireAdmin()
  if (error) return error

  try {
    const { deliveryId } = await params

    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      select: { id: true, status: true, attempts: true, webhookId: true },
    })

    if (!delivery) {
      return NextResponse.json({ error: 'Delivery not found' }, { status: 404 })
    }

    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'PENDING',
        errorMessage: null,
        scheduledAt: new Date(),
      },
    })

    await logAdminAction({
      adminId: session!.user.id,
      action: 'RETRY_WEBHOOK_DELIVERY',
      targetType: 'WebhookDelivery',
      targetId: deliveryId,
      details: { webhookId: delivery.webhookId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Retry webhook delivery error:', error)
    return NextResponse.json({ error: 'Failed to retry delivery' }, { status: 500 })
  }
}
