import { NextRequest, NextResponse } from 'next/server'
import { connectOutlookCalendar } from '@/lib/calendar/outlook'

/**
 * Outlook Calendar OAuth Callback
 * Handles the redirect from Microsoft after user authorizes calendar access
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state') // This contains the userId
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  // Handle OAuth errors
  if (error) {
    console.error('Microsoft OAuth error:', error, errorDescription)
    return NextResponse.redirect(
      new URL(
        `/dashboard/settings?calendar_error=${encodeURIComponent(errorDescription || error)}`,
        process.env.NEXT_PUBLIC_APP_URL
      )
    )
  }

  // Validate required parameters
  if (!code || !state) {
    console.error('Missing code or state in OAuth callback')
    return NextResponse.redirect(
      new URL(
        '/dashboard/settings?calendar_error=invalid_request',
        process.env.NEXT_PUBLIC_APP_URL
      )
    )
  }

  try {
    const userId = state // The userId was passed as state parameter

    // Exchange code for tokens and save calendar
    await connectOutlookCalendar(userId, code)

    // Redirect back to settings with success message
    return NextResponse.redirect(
      new URL('/dashboard/settings?calendar_connected=true', process.env.NEXT_PUBLIC_APP_URL)
    )
  } catch (error) {
    console.error('Failed to connect Outlook Calendar:', error)
    return NextResponse.redirect(
      new URL(
        `/dashboard/settings?calendar_error=${encodeURIComponent(
          error instanceof Error ? error.message : 'connection_failed'
        )}`,
        process.env.NEXT_PUBLIC_APP_URL
      )
    )
  }
}
