import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import { createTeamInvitationSchema } from '@/server/validation/schemas'
import {
  listTeamInvitations,
  createTeamInvitation,
  InvitationNotAuthorizedError,
  InvitationFeatureDeniedError,
  InvitationSubscriptionLockedError,
  InvitationOwnerOnlyError,
  InvitationAlreadyMemberError,
  InvitationAlreadySentError,
  InvitationTeamNotFoundError,
} from '@/server/services/team'

interface RouteParams {
  params: { id: string }
}

// GET /api/teams/[id]/invitations - List pending invitations
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const invitations = await listTeamInvitations(params.id, session.user.id)
    return NextResponse.json({ invitations })
  } catch (error) {
    if (error instanceof InvitationNotAuthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('Error listing invitations:', error)
    return NextResponse.json({ error: 'Failed to list invitations' }, { status: 500 })
  }
}

// POST /api/teams/[id]/invitations - Create invitation
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const body = await request.json()
    const result = createTeamInvitationSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 })
    }

    const invitation = await createTeamInvitation({
      teamId: params.id,
      sessionUserId: session.user.id,
      sessionUserName: session.user.name,
      sessionUserEmail: session.user.email,
      email: result.data.email,
      role: result.data.role,
    })

    return NextResponse.json({ invitation }, { status: 201 })
  } catch (error) {
    if (error instanceof InvitationNotAuthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof InvitationSubscriptionLockedError || error instanceof InvitationFeatureDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof InvitationOwnerOnlyError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof InvitationAlreadyMemberError || error instanceof InvitationAlreadySentError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof InvitationTeamNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('Error creating invitation:', error)
    return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 })
  }
}
