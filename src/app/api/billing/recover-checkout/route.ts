import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import { recoverCheckout } from '@/server/services/billing'

export async function POST() {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const result = await recoverCheckout(session.user.id)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Recover checkout error:', error)
    return NextResponse.json({ error: 'Failed to recover checkout' }, { status: 500 })
  }
}
