/**
 * /api/calendars/conflicts
 * POST: Check for calendar conflicts for a proposed time slot
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { parseISO } from 'date-fns';
import { authOptions } from '@/lib/auth';
import { checkCalendarConflicts } from '@/lib/queue';
import { z } from 'zod';

const checkConflictsSchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  userId: z.string().optional(), // Optional - defaults to current user
});

/**
 * POST /api/calendars/conflicts
 * Check for conflicts in a time slot
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const result = checkConflictsSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { startTime, endTime, userId } = result.data;

    // Only allow checking conflicts for own calendars unless admin
    const targetUserId = userId || session.user.id;
    if (targetUserId !== session.user.id) {
      // Could add admin check here in the future
      return NextResponse.json(
        { error: 'Can only check conflicts for your own calendars' },
        { status: 403 }
      );
    }

    const conflicts = await checkCalendarConflicts(
      targetUserId,
      parseISO(startTime),
      parseISO(endTime)
    );

    return NextResponse.json({
      hasConflict: conflicts.hasConflict,
      conflicts: conflicts.conflictingEvents.map((event) => ({
        title: event.title,
        startTime: event.startTime.toISOString(),
        endTime: event.endTime.toISOString(),
        source: event.source,
      })),
    });
  } catch (error) {
    console.error('POST calendar conflicts error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
