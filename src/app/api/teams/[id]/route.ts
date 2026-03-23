import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import {
  getTeamDetails,
  updateTeam,
  deleteTeam,
  TeamNotFoundError,
  TeamNotAuthorizedError,
  TeamSlugTakenError,
} from '@/server/services/team'

interface RouteParams {
  params: { id: string }
}

// GET /api/teams/[id] - Get team details
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const result = await getTeamDetails(params.id, session.user.id)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof TeamNotFoundError) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }
    console.error('Error fetching team:', error)
    return NextResponse.json({ error: 'Failed to fetch team' }, { status: 500 })
  }
}

// PATCH /api/teams/[id] - Update team
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const body = await request.json()
    const team = await updateTeam({
      teamId: params.id,
      sessionUserId: session.user.id,
      name: body.name,
      slug: body.slug,
      logo: body.logo,
    })

    return NextResponse.json({ team })
  } catch (error) {
    if (error instanceof TeamNotAuthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof TeamSlugTakenError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Error updating team:', error)
    return NextResponse.json({ error: 'Failed to update team' }, { status: 500 })
  }
}

// DELETE /api/teams/[id] - Delete team
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    await deleteTeam(params.id, session.user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof TeamNotAuthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('Error deleting team:', error)
    return NextResponse.json({ error: 'Failed to delete team' }, { status: 500 })
  }
}
