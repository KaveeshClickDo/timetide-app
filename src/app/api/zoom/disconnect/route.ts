/**
 * Zoom Disconnect Endpoint
 * Removes Zoom credentials for the authenticated user
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { disconnectZoomAccount } from '@/lib/zoom';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await disconnectZoomAccount(session.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to disconnect Zoom:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect Zoom account' },
      { status: 500 }
    );
  }
}
