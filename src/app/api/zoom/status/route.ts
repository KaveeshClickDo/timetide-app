/**
 * Zoom Status Endpoint
 * Returns whether the user has Zoom connected
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/admin-auth';
import { hasZoomConnected } from '@/server/integrations/zoom';

export async function GET(request: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  try {
    const connected = await hasZoomConnected(session.user.id);
    return NextResponse.json({ connected });
  } catch (error) {
    console.error('Failed to check Zoom status:', error);
    return NextResponse.json({ connected: false });
  }
}
