/**
 * /api/calendars/sync
 * GET: Get sync status for user's calendars
 * POST: Trigger manual sync for all or specific calendar
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import {
  triggerUserCalendarSync,
  triggerCalendarSync,
  checkCalendarConflicts,
} from '@/lib/queue';

/**
 * GET /api/calendars/sync
 * Get sync status for all user's calendars
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const calendars = await prisma.calendar.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        name: true,
        provider: true,
        isEnabled: true,
        isPrimary: true,
        syncStatus: true,
        lastSyncedAt: true,
        lastSyncError: true,
        credentials: {
          select: {
            expiresAt: true,
          },
        },
        _count: {
          select: {
            syncedEvents: true,
          },
        },
      },
      orderBy: [
        { isPrimary: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    // Calculate overall sync health
    const enabledCalendars = calendars.filter((c) => c.isEnabled);
    const healthyCalendars = enabledCalendars.filter(
      (c) => c.syncStatus === 'SYNCED' || c.syncStatus === 'PENDING'
    );
    const errorCalendars = enabledCalendars.filter(
      (c) => c.syncStatus === 'ERROR' || c.syncStatus === 'DISCONNECTED'
    );

    const overallHealth =
      enabledCalendars.length === 0
        ? 'no_calendars'
        : errorCalendars.length === 0
          ? 'healthy'
          : errorCalendars.length === enabledCalendars.length
            ? 'error'
            : 'partial';

    return NextResponse.json({
      calendars: calendars.map((c) => ({
        id: c.id,
        name: c.name,
        provider: c.provider,
        isEnabled: c.isEnabled,
        isPrimary: c.isPrimary,
        syncStatus: c.syncStatus,
        lastSyncedAt: c.lastSyncedAt,
        lastSyncError: c.lastSyncError,
        tokenExpiresAt: c.credentials?.expiresAt,
        syncedEventsCount: c._count.syncedEvents,
      })),
      summary: {
        total: calendars.length,
        enabled: enabledCalendars.length,
        healthy: healthyCalendars.length,
        errors: errorCalendars.length,
        overallHealth,
      },
    });
  } catch (error) {
    console.error('GET calendar sync status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/calendars/sync
 * Trigger manual sync
 * Body: { calendarId?: string } - if not provided, syncs all calendars
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { calendarId, forceFullSync } = body as {
      calendarId?: string;
      forceFullSync?: boolean;
    };

    if (calendarId) {
      // Verify calendar belongs to user
      const calendar = await prisma.calendar.findFirst({
        where: {
          id: calendarId,
          userId: session.user.id,
        },
      });

      if (!calendar) {
        return NextResponse.json(
          { error: 'Calendar not found' },
          { status: 404 }
        );
      }

      await triggerCalendarSync(calendarId, forceFullSync);

      return NextResponse.json({
        success: true,
        message: `Sync triggered for calendar: ${calendar.name}`,
      });
    } else {
      // Sync all user's calendars
      await triggerUserCalendarSync(session.user.id);

      return NextResponse.json({
        success: true,
        message: 'Sync triggered for all calendars',
      });
    }
  } catch (error) {
    console.error('POST calendar sync error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
