/**
 * Zoom Connect Endpoint
 * Redirects user to Zoom OAuth authorization page
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getZoomAuthUrl } from '@/lib/zoom';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const authUrl = getZoomAuthUrl(session.user.id);

  return NextResponse.redirect(authUrl);
}
