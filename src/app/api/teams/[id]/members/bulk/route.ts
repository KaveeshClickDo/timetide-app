import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import { bulkMemberActionSchema } from '@/server/validation/schemas'
import {
  bulkMemberAction,
  MemberNotAuthorizedError,
  MemberOwnerModifyError,
  MemberLastOwnerError,
  MemberFeatureDeniedError,
  MemberSubscriptionLockedError,
  MemberNoValidMembersError,
} from '@/server/services/team'

interface RouteParams {
  params: { id: string }
}

// POST /api/teams/[id]/members/bulk - Bulk member actions
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const body = await request.json()
    const result = bulkMemberActionSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 })
    }

    const { affected } = await bulkMemberAction({
      teamId: params.id,
      sessionUserId: session.user.id,
      action: result.data.action,
      memberIds: result.data.memberIds,
      role: result.data.role,
    })

    return NextResponse.json({ success: true, affected })
  } catch (error) {
    if (error instanceof MemberNotAuthorizedError || error instanceof MemberOwnerModifyError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof MemberSubscriptionLockedError || error instanceof MemberFeatureDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof MemberLastOwnerError || error instanceof MemberNoValidMembersError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Error performing bulk action:', error)
    return NextResponse.json({ error: 'Failed to perform bulk action' }, { status: 500 })
  }
}
