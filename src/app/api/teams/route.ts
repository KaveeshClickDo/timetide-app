import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import { createTeamSchema } from '@/server/validation/schemas'
import {
  listTeams,
  createTeam,
  TeamFeatureDeniedError,
  TeamSubscriptionLockedError,
} from '@/server/services/team'

// GET /api/teams - List user's teams
export async function GET() {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const teams = await listTeams(session.user.id)
    return NextResponse.json({ teams })
  } catch (error) {
    console.error('Error fetching teams:', error)
    return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 })
  }
}

// POST /api/teams - Create new team
export async function POST(request: Request) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const body = await request.json()
    const result = createTeamSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 })
    }

    const team = await createTeam({
      name: result.data.name,
      slug: result.data.slug,
      userId: session.user.id,
    })

    return NextResponse.json({ team }, { status: 201 })
  } catch (error) {
    if (error instanceof TeamSubscriptionLockedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof TeamFeatureDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('Error creating team:', error)
    return NextResponse.json({ error: 'Failed to create team' }, { status: 500 })
  }
}
