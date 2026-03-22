import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from './auth'

export async function requireAuth() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), session: null }
  }

  return { error: null, session }
}

export async function requireAdmin() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), session: null }
  }

  if (session.user.role !== 'ADMIN') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), session: null }
  }

  return { error: null, session }
}
