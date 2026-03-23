/**
 * /api/teams/[id]/members/integrations
 * GET: Get integration connection status for all team members
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import {
  listMemberIntegrations,
  MemberNotAuthorizedError,
} from '@/server/services/team'

interface RouteParams {
  params: { id: string }
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const members = await listMemberIntegrations(params.id, session.user.id)
    return NextResponse.json({ members })
  } catch (error) {
    if (error instanceof MemberNotAuthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('Error fetching team member integrations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch team member integrations' },
      { status: 500 }
    )
  }
}
