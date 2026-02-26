import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import sharp from 'sharp'
import { logTeamAction } from '@/lib/team-audit'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 2 * 1024 * 1024 // 2MB

interface RouteParams {
  params: { id: string }
}

// POST /api/teams/[id]/logo - Upload team logo
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin/owner access
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

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' },
        { status: 400 }
      )
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 2MB' },
        { status: 400 }
      )
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer())
    const optimized = await sharp(rawBuffer)
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer()

    const logoUrl = `/api/team-logo/${params.id}?v=${Date.now()}`
    const team = await prisma.team.update({
      where: { id: params.id },
      data: {
        logo: logoUrl,
        logoData: new Uint8Array(optimized),
      },
    })

    logTeamAction({
      teamId: params.id,
      userId: session.user.id,
      action: 'team.logo_updated',
      targetType: 'Team',
      targetId: params.id,
    }).catch(() => {})

    return NextResponse.json({ team })
  } catch (error) {
    console.error('Team logo upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload logo' },
      { status: 500 }
    )
  }
}

// DELETE /api/teams/[id]/logo - Remove team logo
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

    const team = await prisma.team.update({
      where: { id: params.id },
      data: {
        logo: null,
        logoData: null,
      },
    })

    logTeamAction({
      teamId: params.id,
      userId: session.user.id,
      action: 'team.logo_removed',
      targetType: 'Team',
      targetId: params.id,
    }).catch(() => {})

    return NextResponse.json({ team })
  } catch (error) {
    console.error('Team logo delete error:', error)
    return NextResponse.json(
      { error: 'Failed to remove logo' },
      { status: 500 }
    )
  }
}
