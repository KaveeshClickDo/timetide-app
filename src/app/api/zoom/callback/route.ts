/**
 * Zoom OAuth Callback Endpoint
 * Handles the OAuth redirect from Zoom after user authorization
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectZoomAccount } from '@/lib/zoom';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // userId
  const error = searchParams.get('error');

  if (error) {
    console.error('Zoom OAuth error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?error=zoom_auth_failed`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?error=missing_params`
    );
  }

  try {
    // Exchange code for tokens and save to database
    await connectZoomAccount(state, code);

    // Redirect back to settings with success message
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?zoom_connected=true`
    );
  } catch (error) {
    console.error('Failed to connect Zoom account:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?error=zoom_connection_failed`
    );
  }
}
