/**
 * Zoom OAuth Callback Endpoint
 * Handles the OAuth redirect from Zoom after user authorization
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectZoomAccount } from '@/lib/zoom';
import { decodeOAuthState, buildRedirectUrl } from '@/lib/oauth-state';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const { returnTo } = state ? decodeOAuthState(state) : { returnTo: '/dashboard/settings' };

  if (error) {
    console.error('Zoom OAuth error:', error);
    return NextResponse.redirect(
      buildRedirectUrl(returnTo, { error: 'zoom_auth_failed' })
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      buildRedirectUrl(returnTo, { error: 'missing_params' })
    );
  }

  try {
    const { userId } = decodeOAuthState(state);

    // Validate that the userId matches the authenticated session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.id !== userId) {
      console.error('OAuth state mismatch: session user does not match state parameter');
      return NextResponse.redirect(
        buildRedirectUrl(returnTo, { error: 'unauthorized' })
      );
    }

    // Exchange code for tokens and save to database
    await connectZoomAccount(session.user.id, code);

    // Redirect back with success message
    return NextResponse.redirect(
      buildRedirectUrl(returnTo, { zoom_connected: 'true' })
    );
  } catch (error) {
    console.error('Failed to connect Zoom account:', error);
    return NextResponse.redirect(
      buildRedirectUrl(returnTo, { error: 'zoom_connection_failed' })
    );
  }
}
