import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getGoogleAuthUrl, exchangeCodeForTokens, connectGoogleCalendar } from '@/lib/calendar/google'

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
        credential: {
          select: {
            id: true,
            provider: true,
            isValid: true,
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
    const { provider, code, redirectUri } = body

    if (provider === 'GOOGLE') {
      if (code) {
        // Exchange code for tokens
        const tokens = await exchangeCodeForTokens(code, redirectUri)
        
        // Connect calendar
        const calendar = await connectGoogleCalendar(
          session.user.id,
          tokens.access_token!,
          tokens.refresh_token!,
          tokens.expiry_date!
        )

        return NextResponse.json({ calendar })
      } else {
        // Generate auth URL
        const authUrl = getGoogleAuthUrl(redirectUri)
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
