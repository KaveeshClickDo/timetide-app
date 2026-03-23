/**
 * Zoom Disconnect Endpoint
 * Removes Zoom credentials for the authenticated user
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/admin-auth';
import { disconnectZoomAccount } from '@/server/integrations/zoom';

export async function POST(request: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

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
