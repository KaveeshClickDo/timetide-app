import { NextResponse } from 'next/server'
import { requireAdmin } from '@/server/auth/admin-auth'
import { getAdminDashboardStats } from '@/server/services/admin'

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const stats = await getAdminDashboardStats()
    return NextResponse.json(stats)
  } catch (error) {
    console.error('Admin stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
