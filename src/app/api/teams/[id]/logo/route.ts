import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import {
  uploadTeamLogo,
  deleteTeamLogo,
  LogoNotAuthorizedError,
  LogoNoFileError,
  LogoInvalidTypeError,
  LogoTooLargeError,
} from '@/server/services/team'

interface RouteParams {
  params: { id: string }
}

// POST /api/teams/[id]/logo - Upload team logo
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    const team = await uploadTeamLogo(params.id, session.user.id, file!)
    return NextResponse.json({ team })
  } catch (error) {
    if (error instanceof LogoNotAuthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof LogoNoFileError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof LogoInvalidTypeError || error instanceof LogoTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Team logo upload error:', error)
    return NextResponse.json({ error: 'Failed to upload logo' }, { status: 500 })
  }
}

// DELETE /api/teams/[id]/logo - Remove team logo
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const team = await deleteTeamLogo(params.id, session.user.id)
    return NextResponse.json({ team })
  } catch (error) {
    if (error instanceof LogoNotAuthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('Team logo delete error:', error)
    return NextResponse.json({ error: 'Failed to remove logo' }, { status: 500 })
  }
}
