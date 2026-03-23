import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import { addTeamMemberSchema } from '@/server/validation/schemas'
import {
  listTeamMembers,
  addTeamMember,
  MemberNotAuthorizedError,
  MemberUserNotFoundError,
  MemberAlreadyExistsError,
  MemberOnlyOwnerCanAddOwnerError,
  MemberFeatureDeniedError,
  MemberSubscriptionLockedError,
} from '@/server/services/team'

interface RouteParams {
  params: { id: string }
}

// GET /api/teams/[id]/members - List team members
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const members = await listTeamMembers(params.id, session.user.id)
    return NextResponse.json({ members })
  } catch (error) {
    if (error instanceof MemberNotAuthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('Error listing team members:', error)
    return NextResponse.json({ error: 'Failed to list team members' }, { status: 500 })
  }
}

// POST /api/teams/[id]/members - Add team member
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const body = await request.json()
    const result = addTeamMemberSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 })
    }

    const member = await addTeamMember({
      teamId: params.id,
      sessionUserId: session.user.id,
      sessionUserName: session.user.name,
      sessionUserEmail: session.user.email,
      email: result.data.email,
      role: result.data.role,
    })

    return NextResponse.json({ member }, { status: 201 })
  } catch (error) {
    if (error instanceof MemberNotAuthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof MemberSubscriptionLockedError || error instanceof MemberFeatureDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof MemberUserNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof MemberAlreadyExistsError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof MemberOnlyOwnerCanAddOwnerError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('Error adding team member:', error)
    return NextResponse.json({ error: 'Failed to add team member' }, { status: 500 })
  }
}
