import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import { createPaymentMethodSession } from '@/server/services/billing'

export async function POST() {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const result = await createPaymentMethodSession({
      userId: session.user.id,
      userEmail: session.user.email,
      userName: session.user.name || null,
    })
    return NextResponse.json({ url: result.url })
  } catch (err) {
    console.error('Update payment method error:', err)
    return NextResponse.json({ error: 'Failed to create setup session' }, { status: 500 })
  }
}
