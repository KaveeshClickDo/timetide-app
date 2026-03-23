/**
 * /api/teams/[id]/members/[memberId]
 * GET: Get member details
 * PATCH: Update member role/priority
 * DELETE: Remove member from team
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import { updateTeamMemberSchema } from '@/server/validation/schemas'
import {
  getTeamMember,
  updateTeamMember,
  removeTeamMember,
  MemberNotFoundError,
  MemberNotAuthorizedError,
  MemberOwnerModifyError,
  MemberLastOwnerError,
} from '@/server/services/team'

interface RouteParams {
  params: { id: string; memberId: string }
}

// GET /api/teams/[id]/members/[memberId]
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const member = await getTeamMember(params.id, params.memberId, session.user.id)
    return NextResponse.json({ member })
  } catch (error) {
    if (error instanceof MemberNotAuthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof MemberNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('Error getting team member:', error)
    return NextResponse.json({ error: 'Failed to get team member' }, { status: 500 })
  }
}

// PATCH /api/teams/[id]/members/[memberId]
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const body = await request.json()
    const result = updateTeamMemberSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 })
    }

    const member = await updateTeamMember({
      teamId: params.id,
      memberId: params.memberId,
      sessionUserId: session.user.id,
      role: result.data.role,
      isActive: result.data.isActive,
      priority: result.data.priority,
    })

    return NextResponse.json({ member })
  } catch (error) {
    if (error instanceof MemberNotAuthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof MemberNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof MemberOwnerModifyError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof MemberLastOwnerError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Error updating team member:', error)
    return NextResponse.json({ error: 'Failed to update team member' }, { status: 500 })
  }
}

// DELETE /api/teams/[id]/members/[memberId]
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    await removeTeamMember(params.id, params.memberId, session.user.id)
    return NextResponse.json({ success: true, message: 'Member removed successfully' })
  } catch (error) {
    if (error instanceof MemberNotAuthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof MemberNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof MemberOwnerModifyError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof MemberLastOwnerError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Error removing team member:', error)
    return NextResponse.json({ error: 'Failed to remove team member' }, { status: 500 })
  }
}
