/**
 * Zoom Connect Endpoint
 * Redirects user to Zoom OAuth authorization page
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/admin-auth';
import { getZoomAuthUrl } from '@/server/integrations/zoom';

export async function GET(request: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const returnTo = request.nextUrl.searchParams.get('returnTo') || undefined;
  const authUrl = getZoomAuthUrl(session.user.id, returnTo);

  return NextResponse.redirect(authUrl);
}
