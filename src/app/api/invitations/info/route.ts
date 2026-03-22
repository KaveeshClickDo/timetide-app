import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/invitations/info?token=... - Get invitation details (public, no auth required)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const invitation = await prisma.teamInvitation.findUnique({
      where: { token },
      include: {
        team: { select: { name: true } },
      },
    })

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    }

    const inviter = await prisma.user.findUnique({
      where: { id: invitation.invitedBy },
      select: { name: true, email: true },
    })

    const expired = invitation.expiresAt < new Date()

    return NextResponse.json({
      teamName: invitation.team.name,
      inviterName: inviter?.name || inviter?.email || 'A team member',
      role: invitation.role.charAt(0) + invitation.role.slice(1).toLowerCase(),
      status: expired ? 'EXPIRED' : invitation.status,
      expired,
    })
  } catch (error) {
    console.error('Error fetching invitation info:', error)
    return NextResponse.json(
      { error: 'Failed to fetch invitation info' },
      { status: 500 }
    )
  }
}
