/**
 * Zoom Status Endpoint
 * Returns whether the user has Zoom connected
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hasZoomConnected } from '@/lib/zoom';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const connected = await hasZoomConnected(session.user.id);
    return NextResponse.json({ connected });
  } catch (error) {
    console.error('Failed to check Zoom status:', error);
    return NextResponse.json({ connected: false });
  }
}
