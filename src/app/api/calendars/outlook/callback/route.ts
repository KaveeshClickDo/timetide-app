import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectOutlookCalendar } from '@/lib/calendar/outlook'
import { decodeOAuthState, buildRedirectUrl } from '@/lib/oauth-state'

/**
 * Outlook Calendar OAuth Callback
 * Handles the redirect from Microsoft after user authorizes calendar access
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  const { returnTo } = state ? decodeOAuthState(state) : { returnTo: '/dashboard/settings' }

  // Handle OAuth errors
  if (error) {
    console.error('Microsoft OAuth error:', error, errorDescription)
    return NextResponse.redirect(
      buildRedirectUrl(returnTo, { calendar_error: errorDescription || error })
    )
  }

  // Validate required parameters
  if (!code || !state) {
    console.error('Missing code or state in OAuth callback')
    return NextResponse.redirect(
      buildRedirectUrl(returnTo, { calendar_error: 'invalid_request' })
    )
  }

  try {
    const { userId } = decodeOAuthState(state)

    // Validate that the userId matches the authenticated session
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || session.user.id !== userId) {
      console.error('OAuth state mismatch: session user does not match state parameter')
      return NextResponse.redirect(
        buildRedirectUrl(returnTo, { calendar_error: 'unauthorized' })
      )
    }

    // Exchange code for tokens and save calendar
    await connectOutlookCalendar(userId, code)

    // Redirect back with success message
    return NextResponse.redirect(
      buildRedirectUrl(returnTo, { calendar_connected: 'true' })
    )
  } catch (error) {
    console.error('Failed to connect Outlook Calendar:', error)
    return NextResponse.redirect(
      buildRedirectUrl(returnTo, {
        calendar_error: error instanceof Error ? error.message : 'connection_failed',
      })
    )
  }
}
