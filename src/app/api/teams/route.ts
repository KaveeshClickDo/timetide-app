import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createTeamSchema } from '@/lib/validation/schemas'
import { nanoid } from 'nanoid'

// GET /api/teams - List user's teams
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const teams = await prisma.team.findMany({
      where: {
        members: {
          some: {
            userId: session.user.id,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
        _count: {
          select: {
            eventTypes: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // Add current user's role to each team
    const teamsWithRole = teams.map((team) => {
      const membership = team.members.find((m) => m.userId === session.user.id)
      return {
        ...team,
        currentUserRole: membership?.role,
      }
    })

    return NextResponse.json({ teams: teamsWithRole })
  } catch (error) {
    console.error('Error fetching teams:', error)
    return NextResponse.json(
      { error: 'Failed to fetch teams' },
      { status: 500 }
    )
  }
}

// POST /api/teams - Create new team
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const result = createTeamSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      )
    }

    const { name, slug } = result.data

    // Generate unique slug if not provided
    let teamSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    let counter = 1

    while (await prisma.team.findUnique({ where: { slug: teamSlug } })) {
      teamSlug = `${slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${counter}`
      counter++
    }

    const team = await prisma.team.create({
      data: {
        name,
        slug: teamSlug,
        members: {
          create: {
            userId: session.user.id,
            role: 'OWNER',
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
      },
    })

    return NextResponse.json({ team }, { status: 201 })
  } catch (error) {
    console.error('Error creating team:', error)
    return NextResponse.json(
      { error: 'Failed to create team' },
      { status: 500 }
    )
  }
}
