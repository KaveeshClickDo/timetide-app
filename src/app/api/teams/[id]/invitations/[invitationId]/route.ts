import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import {
  cancelTeamInvitation,
  InvitationNotAuthorizedError,
  InvitationNotFoundError,
  InvitationNotPendingError,
} from '@/server/services/team'

interface RouteParams {
  params: { id: string; invitationId: string }
}

// DELETE /api/teams/[id]/invitations/[invitationId] - Cancel invitation
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    await cancelTeamInvitation(params.id, params.invitationId, session.user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof InvitationNotAuthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof InvitationNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof InvitationNotPendingError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Error cancelling invitation:', error)
    return NextResponse.json({ error: 'Failed to cancel invitation' }, { status: 500 })
  }
}
