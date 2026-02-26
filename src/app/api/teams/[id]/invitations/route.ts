import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createTeamInvitationSchema } from '@/lib/validation/schemas'
import { queueTeamInvitationEmail } from '@/lib/queue/email-queue'
import { logTeamAction } from '@/lib/team-audit'

interface RouteParams {
  params: { id: string }
}

// GET /api/teams/[id]/invitations - List pending invitations
export async function GET(request: Request, { params }: RouteParams) {
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

    const invitations = await prisma.teamInvitation.findMany({
      where: {
        teamId: params.id,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    })

    // Resolve inviter names
    const inviterIds = Array.from(new Set(invitations.map((i) => i.invitedBy)))
    const inviters = await prisma.user.findMany({
      where: { id: { in: inviterIds } },
      select: { id: true, name: true, email: true },
    })
    const inviterMap = new Map(inviters.map((u) => [u.id, u]))

    return NextResponse.json({
      invitations: invitations.map((inv) => ({
        ...inv,
        inviter: inviterMap.get(inv.invitedBy) || null,
      })),
    })
  } catch (error) {
    console.error('Error listing invitations:', error)
    return NextResponse.json(
      { error: 'Failed to list invitations' },
      { status: 500 }
    )
  }
}

// POST /api/teams/[id]/invitations - Create invitation
export async function POST(request: Request, { params }: RouteParams) {
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

    const body = await request.json()
    const result = createTeamInvitationSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      )
    }

    const { email, role } = result.data
    const normalizedEmail = email.toLowerCase()

    // Only owner can invite as owner
    if (role === 'OWNER' && membership.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Only owners can invite other owners' },
        { status: 403 }
      )
    }

    // Check if already a team member
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (existingUser) {
      const existingMembership = await prisma.teamMember.findUnique({
        where: {
          teamId_userId: {
            teamId: params.id,
            userId: existingUser.id,
          },
        },
      })

      if (existingMembership) {
        return NextResponse.json(
          { error: 'This user is already a member of the team' },
          { status: 400 }
        )
      }
    }

    // Check for existing pending invitation
    const existingInvitation = await prisma.teamInvitation.findUnique({
      where: {
        teamId_email: {
          teamId: params.id,
          email: normalizedEmail,
        },
      },
    })

    if (existingInvitation && existingInvitation.status === 'PENDING' && existingInvitation.expiresAt > new Date()) {
      return NextResponse.json(
        { error: 'An invitation has already been sent to this email' },
        { status: 400 }
      )
    }

    // Get team info for email
    const team = await prisma.team.findUnique({
      where: { id: params.id },
      select: { name: true, slug: true },
    })

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    // Upsert invitation (handles case where expired/declined invitation exists)
    const invitation = await prisma.teamInvitation.upsert({
      where: {
        teamId_email: {
          teamId: params.id,
          email: normalizedEmail,
        },
      },
      create: {
        teamId: params.id,
        email: normalizedEmail,
        role,
        invitedBy: session.user.id,
        expiresAt,
      },
      update: {
        role,
        status: 'PENDING',
        invitedBy: session.user.id,
        expiresAt,
      },
    })

    // Send invitation email
    const actorName = session.user.name || session.user.email || 'Someone'
    const roleName = role.charAt(0) + role.slice(1).toLowerCase()
    const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invitations/accept?token=${invitation.token}`

    try {
      await queueTeamInvitationEmail(normalizedEmail, {
        memberName: normalizedEmail,
        teamName: team.name,
        actorName,
        role: roleName,
        teamUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/teams/${params.id}`,
        expiresIn: '7 days',
        acceptUrl,
      })
    } catch (err) {
      console.error('Failed to send invitation email:', err)
    }

    logTeamAction({
      teamId: params.id,
      userId: session.user.id,
      action: 'invitation.sent',
      targetType: 'TeamInvitation',
      targetId: invitation.id,
      changes: { email: normalizedEmail, role },
    }).catch(() => {})

    return NextResponse.json({ invitation }, { status: 201 })
  } catch (error) {
    console.error('Error creating invitation:', error)
    return NextResponse.json(
      { error: 'Failed to create invitation' },
      { status: 500 }
    )
  }
}
