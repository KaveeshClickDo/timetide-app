import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/admin-audit'
import { refundPayment } from '@/lib/stripe'
import { queuePaymentRefundedEmail } from '@/lib/infrastructure/queue/email-queue'

/** POST - Issue a full or partial refund */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAdmin()
  if (error) return error

  const { id } = await params

  try {
    const body = await req.json()
    const { amount, reason } = body as { amount?: number; reason?: string }

    // Fetch the payment
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, name: true } } },
    })

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    if (!payment.stripePaymentIntentId) {
      return NextResponse.json({ error: 'No Stripe PaymentIntent associated with this payment' }, { status: 400 })
    }

    if (payment.status === 'refunded') {
      return NextResponse.json({ error: 'Payment has already been fully refunded' }, { status: 400 })
    }

    // Calculate refundable amount
    const alreadyRefunded = payment.refundedAmount || 0
    const maxRefundable = payment.amount - alreadyRefunded

    if (maxRefundable <= 0) {
      return NextResponse.json({ error: 'No refundable amount remaining' }, { status: 400 })
    }

    const refundAmount = amount ? Math.min(amount, maxRefundable) : maxRefundable
    if (refundAmount <= 0) {
      return NextResponse.json({ error: 'Refund amount must be greater than 0' }, { status: 400 })
    }

    // Issue refund via Stripe
    const refund = await refundPayment(payment.stripePaymentIntentId, refundAmount)

    // Update payment record
    const newRefundedTotal = alreadyRefunded + refundAmount
    const isFullRefund = newRefundedTotal >= payment.amount

    const updatedPayment = await prisma.payment.update({
      where: { id },
      data: {
        status: isFullRefund ? 'refunded' : 'partial_refund',
        refundedAmount: newRefundedTotal,
        refundedAt: new Date(),
        refundReason: reason || null,
      },
    })

    await logAdminAction({
      adminId: session!.user.id,
      action: 'REFUND_PAYMENT',
      targetType: 'Payment',
      targetId: id,
      details: {
        userId: payment.userId,
        userEmail: payment.user.email,
        refundAmount,
        totalRefunded: newRefundedTotal,
        isFullRefund,
        stripeRefundId: refund.id,
        reason: reason || null,
      },
    })

    // Send refund notification email to user
    if (payment.user.email) {
      const now = new Date()
      queuePaymentRefundedEmail({
        userName: payment.user.name || 'there',
        userEmail: payment.user.email,
        planName: payment.planTier,
        planTier: payment.planTier,
        amount: refundAmount,
        currency: payment.currency,
        invoiceNumber: '',
        paymentDate: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        paymentType: payment.type as 'initial' | 'renewal' | 'upgrade_proration',
        refundAmount,
        refundReason: reason || undefined,
        originalAmount: payment.amount,
        updatePaymentUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
        billingUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
      }).catch(console.error)
    }

    return NextResponse.json({
      success: true,
      payment: updatedPayment,
      refund: {
        id: refund.id,
        amount: refundAmount,
        isFullRefund,
      },
    })
  } catch (err) {
    console.error('Refund error:', err)
    const message = err instanceof Error ? err.message : 'Failed to process refund'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
