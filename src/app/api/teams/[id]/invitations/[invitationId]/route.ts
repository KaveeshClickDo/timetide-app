import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logTeamAction } from '@/lib/team-audit'

interface RouteParams {
  params: { id: string; invitationId: string }
}

// DELETE /api/teams/[id]/invitations/[invitationId] - Cancel invitation
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const membership = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: params.id,
          userId: session.user.id,
        },
      },
    })

    if (!membership || membership.role === 'MEMBER') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const invitation = await prisma.teamInvitation.findUnique({
      where: { id: params.invitationId },
    })

    if (!invitation || invitation.teamId !== params.id) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    }

    if (invitation.status !== 'PENDING') {
      return NextResponse.json({ error: 'Invitation is not pending' }, { status: 400 })
    }

    await prisma.teamInvitation.update({
      where: { id: params.invitationId },
      data: { status: 'EXPIRED' },
    })

    logTeamAction({
      teamId: params.id,
      userId: session.user.id,
      action: 'invitation.cancelled',
      targetType: 'TeamInvitation',
      targetId: params.invitationId,
      changes: { email: invitation.email },
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error cancelling invitation:', error)
    return NextResponse.json(
      { error: 'Failed to cancel invitation' },
      { status: 500 }
    )
  }
}
