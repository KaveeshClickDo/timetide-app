import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import { DEFAULT_PAGE_SIZE } from '@/server/api-constants'
import {
  listTeamAuditLog,
  AuditLogNotAuthorizedError,
} from '@/server/services/team'

interface RouteParams {
  params: { id: string }
}

// GET /api/teams/[id]/audit-log
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const { searchParams } = new URL(request.url)
    const cursor = searchParams.get('cursor')
    const limit = parseInt(searchParams.get('limit') || String(DEFAULT_PAGE_SIZE))

    const result = await listTeamAuditLog({
      teamId: params.id,
      sessionUserId: session.user.id,
      cursor,
      limit,
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AuditLogNotAuthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('Error fetching audit log:', error)
    return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 })
  }
}
