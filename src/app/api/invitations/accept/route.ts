import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { acceptTeamInvitationSchema } from '@/lib/validation/schemas'
import { createNotification, buildTeamNotification } from '@/lib/notifications'
import { logTeamAction } from '@/lib/team-audit'

// POST /api/invitations/accept - Accept a team invitation
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const result = acceptTeamInvitationSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      )
    }

    const { token } = result.data

    const invitation = await prisma.teamInvitation.findUnique({
      where: { token },
      include: {
        team: { select: { id: true, name: true, slug: true } },
      },
    })

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    }

    if (invitation.status !== 'PENDING') {
      return NextResponse.json({ error: 'This invitation is no longer valid' }, { status: 400 })
    }

    if (invitation.expiresAt < new Date()) {
      await prisma.teamInvitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      })
      return NextResponse.json({ error: 'This invitation has expired' }, { status: 400 })
    }

    // Verify email matches
    if (session.user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      return NextResponse.json(
        { error: 'This invitation was sent to a different email address' },
        { status: 403 }
      )
    }

    // Check if already a member
    const existingMembership = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: invitation.teamId,
          userId: session.user.id,
        },
      },
    })

    if (existingMembership) {
      // Mark invitation as accepted anyway
      await prisma.teamInvitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED' },
      })
      return NextResponse.json({
        success: true,
        team: invitation.team,
        message: 'You are already a member of this team',
      })
    }

    // Create member and update invitation in a transaction
    const [member] = await prisma.$transaction([
      prisma.teamMember.create({
        data: {
          teamId: invitation.teamId,
          userId: session.user.id,
          role: invitation.role,
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      }),
      prisma.teamInvitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED' },
      }),
    ])

    // Send notification to the inviter
    try {
      const actorName = session.user.name || session.user.email || 'Someone'
      const notif = buildTeamNotification('TEAM_MEMBER_ADDED', {
        teamName: invitation.team.name,
        actorName,
      })
      await createNotification({
        userId: invitation.invitedBy,
        type: 'TEAM_MEMBER_ADDED',
        title: notif.title,
        message: `${actorName} accepted the invitation to join "${invitation.team.name}"`,
      })
    } catch (err) {
      console.error('Failed to send acceptance notification:', err)
    }

    logTeamAction({
      teamId: invitation.teamId,
      userId: session.user.id,
      action: 'invitation.accepted',
      targetType: 'TeamInvitation',
      targetId: invitation.id,
      changes: { email: invitation.email, role: invitation.role },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      team: invitation.team,
      member,
    })
  } catch (error) {
    console.error('Error accepting invitation:', error)
    return NextResponse.json(
      { error: 'Failed to accept invitation' },
      { status: 500 }
    )
  }
}
