import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/admin-auth'
import prisma from '@/server/db/prisma'
import { getGoogleAuthUrl, connectGoogleCalendar } from '@/server/integrations/calendar/google'
import { getOutlookAuthUrl, connectOutlookCalendar } from '@/server/integrations/calendar/outlook'

// GET /api/calendars - List connected calendars
export async function GET() {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const calendars = await prisma.calendar.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        credentials: {
          select: {
            id: true,
            expiresAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    return NextResponse.json({ calendars })
  } catch (error) {
    console.error('Error fetching calendars:', error)
    return NextResponse.json(
      { error: 'Failed to fetch calendars' },
      { status: 500 }
    )
  }
}

// POST /api/calendars/connect - Initiate calendar connection
export async function POST(request: Request) {
  try {
    const { error, session } = await requireAuth()
    if (error) return error

    const body = await request.json()
    const { provider, code, returnTo } = body

    // Validate returnTo is a safe internal path (defense-in-depth — also checked on decode)
    const safeReturnTo = typeof returnTo === 'string' && returnTo.startsWith('/dashboard/')
      ? returnTo
      : undefined;

    if (provider === 'GOOGLE') {
      if (code) {
        const calendar = await connectGoogleCalendar(session.user.id, code)
        return NextResponse.json({ calendar })
      } else {
        const authUrl = getGoogleAuthUrl(session.user.id, safeReturnTo)
        return NextResponse.json({ authUrl })
      }
    }

    if (provider === 'OUTLOOK') {
      if (code) {
        const calendar = await connectOutlookCalendar(session.user.id, code)
        return NextResponse.json({ calendar })
      } else {
        const authUrl = getOutlookAuthUrl(session.user.id, safeReturnTo)
        return NextResponse.json({ authUrl })
      }
    }

    return NextResponse.json(
      { error: 'Unsupported provider' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error connecting calendar:', error)
    return NextResponse.json(
      { error: 'Failed to connect calendar' },
      { status: 500 }
    )
  }
}
