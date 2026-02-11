import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getGoogleAuthUrl, connectGoogleCalendar } from '@/lib/calendar/google'
import { getOutlookAuthUrl, connectOutlookCalendar } from '@/lib/calendar/outlook'

// GET /api/calendars - List connected calendars
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const calendars = await prisma.calendar.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        credentials: {
          select: {
            id: true,
            accessToken: true,
            refreshToken: true,
            expiresAt: true,
          },
        },
      },
      orderBy: {
        isPrimary: 'desc',
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
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { provider, code, returnTo } = body

    if (provider === 'GOOGLE') {
      if (code) {
        const calendar = await connectGoogleCalendar(session.user.id, code)
        return NextResponse.json({ calendar })
      } else {
        const authUrl = getGoogleAuthUrl(session.user.id, returnTo)
        return NextResponse.json({ authUrl })
      }
    }

    if (provider === 'OUTLOOK') {
      if (code) {
        const calendar = await connectOutlookCalendar(session.user.id, code)
        return NextResponse.json({ calendar })
      } else {
        const authUrl = getOutlookAuthUrl(session.user.id, returnTo)
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
