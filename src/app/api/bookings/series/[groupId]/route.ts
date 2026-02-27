/**
 * /api/bookings/series/[groupId]
 * GET: Get all bookings in a recurring series
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

interface RouteParams {
  params: { groupId: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { groupId } = params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const bookings = await prisma.booking.findMany({
      where: {
        recurringGroupId: groupId,
        hostId: session.user.id,
      },
      include: {
        eventType: {
          select: {
            title: true,
            slug: true,
            length: true,
            locationType: true,
            description: true,
          },
        },
      },
      orderBy: { recurringIndex: 'asc' },
    });

    if (bookings.length === 0) {
      return NextResponse.json(
        { error: 'Recurring series not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      groupId,
      bookings: bookings.map(b => ({
        id: b.id,
        uid: b.uid,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        recurringIndex: b.recurringIndex,
        recurringCount: b.recurringCount,
        location: b.location,
        meetingUrl: b.meetingUrl,
        calendarEventId: b.calendarEventId,
        timezone: b.timezone,
      })),
      eventType: bookings[0].eventType,
      inviteeName: bookings[0].inviteeName,
      inviteeEmail: bookings[0].inviteeEmail,
      totalOccurrences: bookings.length,
      recurringFrequency: bookings[0].recurringFrequency,
      recurringInterval: bookings[0].recurringInterval,
    });
  } catch (error) {
    console.error('GET recurring series error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
