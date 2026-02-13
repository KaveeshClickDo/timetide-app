/**
 * /api/bookings/[id]/calendar
 * GET: Redirect to calendar provider or download ICS
 * Supports: google, outlook, apple, office365, yahoo, ics (download)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

interface RouteParams {
  params: { id: string };
}

/**
 * Generate ICS (iCalendar) format content
 */
function generateICS(booking: {
  uid: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  eventType: { title: string; description?: string };
  host: { name: string; email: string };
  inviteeName: string;
  inviteeEmail: string;
  location?: string;
  meetingUrl?: string;
  inviteeNotes?: string;
}): string {
  // Helper to format date for ICS (YYYYMMDDTHHMMSSZ)
  const formatICSDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const now = new Date();
  const dtStamp = formatICSDate(now);
  const dtStart = formatICSDate(booking.startTime);
  const dtEnd = formatICSDate(booking.endTime);

  // Build description
  let description = booking.eventType.description || '';
  if (booking.inviteeNotes) {
    description += `\\n\\nNotes from ${booking.inviteeName}:\\n${booking.inviteeNotes}`;
  }
  description += `\\n\\nBooked via TimeTide`;

  // Build location
  let location = booking.location || '';
  if (booking.meetingUrl) {
    location = booking.meetingUrl;
  }

  // Sanitize text for ICS format (escape special characters)
  const sanitize = (text: string): string => {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  };

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TimeTide//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${booking.uid}@timetide.app`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${sanitize(booking.eventType.title)}`,
    description ? `DESCRIPTION:${sanitize(description)}` : '',
    location ? `LOCATION:${sanitize(location)}` : '',
    `ORGANIZER;CN=${sanitize(booking.host.name)}:mailto:${booking.host.email}`,
    `ATTENDEE;CN=${sanitize(booking.inviteeName)};RSVP=TRUE:mailto:${booking.inviteeEmail}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:Reminder: ${sanitize(booking.eventType.title)} in 15 minutes`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');

  return icsContent;
}

/**
 * Generate calendar provider URLs
 */
function generateCalendarUrl(
  provider: string,
  booking: {
    startTime: Date;
    endTime: Date;
    eventType: { title: string; description?: string };
    location?: string;
    meetingUrl?: string;
    inviteeNotes?: string;
  }
): string {
  // Format dates for URL (YYYYMMDDTHHMMSSZ)
  const formatDateForUrl = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const startTime = formatDateForUrl(booking.startTime);
  const endTime = formatDateForUrl(booking.endTime);
  const title = encodeURIComponent(booking.eventType.title);

  let description = booking.eventType.description || '';
  if (booking.inviteeNotes) {
    description += `\n\nNotes: ${booking.inviteeNotes}`;
  }
  if (booking.meetingUrl) {
    description += `\n\nJoin: ${booking.meetingUrl}`;
  }
  description += '\n\nBooked via TimeTide';
  const details = encodeURIComponent(description);

  const location = encodeURIComponent(booking.meetingUrl || booking.location || '');

  switch (provider.toLowerCase()) {
    case 'google':
      // Google Calendar Add Event URL
      return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startTime}/${endTime}&details=${details}&location=${location}`;

    case 'outlook':
    case 'office365':
      // Outlook Web Add Event URL
      return `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&startdt=${booking.startTime.toISOString()}&enddt=${booking.endTime.toISOString()}&body=${details}&location=${location}`;

    case 'yahoo':
      // Yahoo Calendar Add Event URL
      const yahooStart = formatDateForUrl(booking.startTime);
      const duration = Math.floor((booking.endTime.getTime() - booking.startTime.getTime()) / 1000 / 60); // minutes
      return `https://calendar.yahoo.com/?v=60&title=${title}&st=${yahooStart}&dur=${duration}&desc=${details}&in_loc=${location}`;

    case 'apple':
    case 'ics':
    default:
      // For Apple Calendar and others, we'll still return null and generate ICS
      return '';
  }
}

/**
 * GET /api/bookings/[id]/calendar
 * Redirect to calendar provider or download ICS file
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;
    const { searchParams } = request.nextUrl;
    const provider = searchParams.get('provider') || 'google'; // Default to Google

    // Only allow access via booking UID (not internal ID) for unauthenticated users
    const session = await getServerSession(authOptions);
    const booking = await prisma.booking.findFirst({
      where: {
        OR: [{ id }, { uid: id }],
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      include: {
        eventType: {
          select: {
            title: true,
            description: true,
          },
        },
        host: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found or cannot be added to calendar' },
        { status: 404 }
      );
    }

    // Verify access: must be the host or accessed via UID
    const isHost = session?.user?.id === booking.hostId;
    const accessedByUid = id === booking.uid;
    if (!isHost && !accessedByUid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Generate calendar URL for supported providers
    const calendarUrl = generateCalendarUrl(provider, {
      startTime: booking.startTime,
      endTime: booking.endTime,
      eventType: {
        title: booking.eventType.title,
        description: booking.eventType.description ?? undefined,
      },
      location: booking.location ?? undefined,
      meetingUrl: booking.meetingUrl ?? undefined,
      inviteeNotes: booking.inviteeNotes ?? undefined,
    });

    // If we got a URL, redirect to it
    if (calendarUrl) {
      return NextResponse.redirect(calendarUrl);
    }

    // Otherwise, generate and download ICS file (for Apple, iCal, etc.)
    const icsContent = generateICS({
      uid: booking.uid,
      startTime: booking.startTime,
      endTime: booking.endTime,
      timezone: booking.timezone,
      eventType: {
        title: booking.eventType.title,
        description: booking.eventType.description ?? undefined,
      },
      host: {
        name: booking.host.name ?? 'Host',
        email: booking.host.email!,
      },
      inviteeName: booking.inviteeName,
      inviteeEmail: booking.inviteeEmail,
      location: booking.location ?? undefined,
      meetingUrl: booking.meetingUrl ?? undefined,
      inviteeNotes: booking.inviteeNotes ?? undefined,
    });

    // Return ICS file
    const fileName = `booking-${booking.uid}.ics`;

    return new NextResponse(icsContent, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('GET calendar error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
