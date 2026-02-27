/**
 * /api/bookings
 * GET: List user's bookings (authenticated)
 * POST: Create a new booking (public)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { addMinutes, addDays, parseISO, startOfDay } from 'date-fns';
import { generateRecurringDates, FREQUENCY_LABELS, type RecurringFrequency } from '@/lib/recurring/utils';
import { formatInTimeZone } from 'date-fns-tz';
import { nanoid } from 'nanoid';
import prisma from '@/lib/prisma';
import { type Prisma, BookingStatus } from '@/generated/prisma/client';
import { authOptions } from '@/lib/auth';
import { createBookingSchema } from '@/lib/validation/schemas';
import { isSlotAvailable, mergeBusyTimes } from '@/lib/slots/calculator';
import { createNotification, buildBookingNotification } from '@/lib/notifications';
import { getAllBusyTimes } from '@/lib/calendar/google';
import {
  createGoogleCalendarEvent,
  CreateCalendarEventParams,
  CreateCalendarEventResult,
} from '@/lib/calendar/google';
import { createOutlookCalendarEvent } from '@/lib/calendar/outlook';
import {
  createZoomMeeting,
  hasZoomConnected,
} from '@/lib/zoom';
import { BookingEmailData, RecurringBookingEmailData } from '@/lib/email/client';
import {
  checkBookingRateLimit,
  queueBookingConfirmationEmails,
  queueRecurringBookingConfirmationEmails,
  queueBookingPendingEmails,
  scheduleBookingReminders,
  triggerBookingCreatedWebhook,
} from '@/lib/queue';

/**
 * GET /api/bookings
 * List bookings for authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const upcoming = searchParams.get('upcoming') === 'true';
    const past = searchParams.get('past') === 'true';

    const where: Prisma.BookingWhereInput = {
      hostId: session.user.id,
    };

    if (status) {
      where.status = status as BookingStatus;
    }

    if (upcoming) {
      where.startTime = { gte: new Date() };
      where.status = { in: ['PENDING', 'CONFIRMED'] };
    }

    if (past) {
      where.startTime = { lt: new Date() };
      where.status = { notIn: ['CANCELLED', 'REJECTED', 'SKIPPED'] }; // Exclude cancelled, rejected, and skipped from past
    }

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        eventType: {
          select: {
            id: true,
            title: true,
            length: true,
            locationType: true,
          },
        },
      },
      orderBy: { startTime: upcoming ? 'asc' : 'desc' },
      take: 50,
    });

    return NextResponse.json({ bookings });
  } catch (error) {
    console.error('GET bookings error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/bookings
 * Create a new booking (public endpoint)
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting (Redis-backed with in-memory fallback)
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const rateLimitResult = await checkBookingRateLimit(ip);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many booking attempts. Please try again later.' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.resetAt.toString(),
          },
        }
      );
    }

    // Parse and validate body
    const body = await request.json();
    const validated = createBookingSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid booking data', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { eventTypeId, startTime, timezone, name, email, phone, notes, responses, recurring } =
      validated.data;

    // Fetch event type with team member assignments
    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId, isActive: true },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
            timezone: true,
          },
        },
        schedule: true,
        team: {
          select: {
            id: true,
            name: true,
          },
        },
        teamMemberAssignments: {
          where: { isActive: true },
          include: {
            teamMember: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    username: true,
                    timezone: true,
                  },
                },
              },
            },
          },
          orderBy: {
            teamMember: {
              priority: 'asc',
            },
          },
        },
      },
    });

    if (!eventType) {
      return NextResponse.json(
        { error: 'Event type not found or is not active' },
        { status: 404 }
      );
    }

    // Validate recurring request
    if (recurring && !eventType.allowsRecurring) {
      return NextResponse.json(
        { error: 'This event type does not allow recurring bookings' },
        { status: 400 }
      );
    }

    // Validate recurring sessions against event type max
    if (recurring && eventType.recurringMaxWeeks && recurring.weeks > eventType.recurringMaxWeeks) {
      return NextResponse.json(
        { error: `This event type allows a maximum of ${eventType.recurringMaxWeeks} sessions` },
        { status: 400 }
      );
    }

    // Compute actual recurring dates to validate booking window
    const recurringFrequency = (recurring?.frequency || eventType.recurringFrequency || 'weekly') as RecurringFrequency;
    const recurringInterval = recurring?.interval || eventType.recurringInterval || undefined;

    // Validate recurring occurrences fit within the booking window
    if (recurring && recurring.weeks > 1) {
      const recurringDates = generateRecurringDates(parseISO(startTime), {
        frequency: recurringFrequency,
        count: recurring.weeks,
        interval: recurringInterval,
      });
      const lastOccurrence = recurringDates[recurringDates.length - 1];
      let windowEnd: Date | null = null;

      if (eventType.periodType === 'ROLLING' && eventType.periodDays) {
        windowEnd = addDays(new Date(), eventType.periodDays);
      } else if (eventType.periodType === 'RANGE' && eventType.periodEndDate) {
        windowEnd = new Date(eventType.periodEndDate);
      }

      if (windowEnd && lastOccurrence > windowEnd) {
        return NextResponse.json(
          { error: `The last occurrence falls outside the booking window. Please reduce the number of sessions.` },
          { status: 400 }
        );
      }
    }

    const startDate = parseISO(startTime);
    const endDate = addMinutes(startDate, eventType.length);

    // Determine the host based on whether this is a team event
    let selectedHost = {
      id: eventType.userId,
      name: eventType.user.name,
      email: eventType.user.email,
      username: eventType.user.username,
      timezone: eventType.user.timezone,
    };

    // Track assigned user for team events
    let assignedUserId: string | undefined;
    let shouldUpdateRoundRobinState = false;

    // Handle team scheduling
    if (eventType.teamId && eventType.schedulingType && eventType.teamMemberAssignments.length > 0) {
      const assignedMembers = eventType.teamMemberAssignments.map(a => a.teamMember);

      if (eventType.schedulingType === 'ROUND_ROBIN') {
        // Find the next available member using round-robin rotation
        // Start from the member after lastAssignedMemberId
        const lastAssignedIndex = eventType.lastAssignedMemberId
          ? assignedMembers.findIndex(m => m.id === eventType.lastAssignedMemberId)
          : -1;

        let memberIndex = lastAssignedIndex;

        // Try each member in rotation order
        for (let i = 0; i < assignedMembers.length; i++) {
          memberIndex = (memberIndex + 1) % assignedMembers.length;
          const member = assignedMembers[memberIndex];

          // Check if member is available
          let memberBusyTimes: { start: Date; end: Date }[] = [];
          try {
            memberBusyTimes = await getAllBusyTimes(
              member.user.id,
              addMinutes(startDate, -60),
              addMinutes(endDate, 60)
            );
          } catch {
            // Calendar not connected, continue
          }

          const memberBookings = await prisma.booking.findMany({
            where: {
              OR: [
                { hostId: member.user.id },
                { assignedUserId: member.user.id },
              ],
              status: { in: ['PENDING', 'CONFIRMED'] },
              startTime: { lt: endDate },
              endTime: { gt: startDate },
            },
          });

          const memberBusyFromBookings = memberBookings.map(b => ({
            start: b.startTime,
            end: b.endTime,
          }));

          const allMemberBusy = mergeBusyTimes([...memberBusyTimes, ...memberBusyFromBookings]);
          const isAvailable = isSlotAvailable(
            { start: startDate, end: endDate },
            allMemberBusy,
            eventType.bufferTimeBefore,
            eventType.bufferTimeAfter
          );

          if (isAvailable) {
            selectedHost = {
              id: member.user.id,
              name: member.user.name,
              email: member.user.email,
              username: member.user.username,
              timezone: member.user.timezone,
            };
            assignedUserId = member.user.id;
            shouldUpdateRoundRobinState = true;
            break;
          }
        }

        if (!assignedUserId) {
          return NextResponse.json(
            { error: 'No team members are available at this time.' },
            { status: 409 }
          );
        }
      } else if (eventType.schedulingType === 'COLLECTIVE') {
        // For collective, all members must be available
        let allAvailable = true;

        for (const member of assignedMembers) {
          let memberBusyTimes: { start: Date; end: Date }[] = [];
          try {
            memberBusyTimes = await getAllBusyTimes(
              member.user.id,
              addMinutes(startDate, -60),
              addMinutes(endDate, 60)
            );
          } catch {
            // Calendar not connected, continue
          }

          const memberBookings = await prisma.booking.findMany({
            where: {
              OR: [
                { hostId: member.user.id },
                { assignedUserId: member.user.id },
              ],
              status: { in: ['PENDING', 'CONFIRMED'] },
              startTime: { lt: endDate },
              endTime: { gt: startDate },
            },
          });

          const memberBusyFromBookings = memberBookings.map(b => ({
            start: b.startTime,
            end: b.endTime,
          }));

          const allMemberBusy = mergeBusyTimes([...memberBusyTimes, ...memberBusyFromBookings]);
          const isAvailable = isSlotAvailable(
            { start: startDate, end: endDate },
            allMemberBusy,
            eventType.bufferTimeBefore,
            eventType.bufferTimeAfter
          );

          if (!isAvailable) {
            allAvailable = false;
            break;
          }
        }

        if (!allAvailable) {
          return NextResponse.json(
            { error: 'This time slot is no longer available for all team members.' },
            { status: 409 }
          );
        }

        // Use the first assigned member as host (all members participate)
        selectedHost = {
          id: assignedMembers[0].user.id,
          name: assignedMembers[0].user.name,
          email: assignedMembers[0].user.email,
          username: assignedMembers[0].user.username,
          timezone: assignedMembers[0].user.timezone,
        };
        // For collective, the assigned user is effectively all members (host handles it)
      } else if (eventType.schedulingType === 'MANAGED') {
        // For MANAGED: booking is created but assignment happens later by host/admin
        // Use the event type owner as the initial host
        // The booking will need to be assigned to a specific member later
        selectedHost = {
          id: eventType.user.id,
          name: eventType.user.name,
          email: eventType.user.email,
          username: eventType.user.username,
          timezone: eventType.user.timezone,
        };
        // assignedUserId remains undefined - will be set by host/admin later
      }
    }

    // Verify the slot is still available for the selected host
    const calendarBusyTimes = await getAllBusyTimes(
      selectedHost.id,
      addMinutes(startDate, -60),
      addMinutes(endDate, 60)
    );

    // CRITICAL: Check ALL bookings for this host (across all event types) to prevent double booking
    const existingBookings = await prisma.booking.findMany({
      where: {
        hostId: selectedHost.id, // Check all bookings for this host, not just this event type
        status: { in: ['PENDING', 'CONFIRMED'] },
        OR: [
          {
            startTime: { lt: endDate },
            endTime: { gt: startDate },
          },
        ],
      },
    });

    const isGroupEvent = (eventType.seatsPerSlot ?? 1) > 1;
    const seatsPerSlot = eventType.seatsPerSlot ?? 1;

    // For group events: check seat capacity separately, exclude same-event bookings from busy times
    if (isGroupEvent) {
      // Count existing bookings for THIS event type at THIS exact slot
      const slotBookingCount = await prisma.booking.count({
        where: {
          eventTypeId,
          startTime: startDate,
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
      });

      if (slotBookingCount >= seatsPerSlot) {
        return NextResponse.json(
          { error: 'All seats for this time slot are taken. Please select another time.' },
          { status: 409 }
        );
      }
    }

    // Build busy times: for group events, exclude this event type's bookings
    // (they don't block the host since multiple people share the same slot)
    const bookingBusyTimes = existingBookings
      .filter((b) => !isGroupEvent || b.eventTypeId !== eventTypeId)
      .map((b) => ({
        start: b.startTime,
        end: b.endTime,
      }));

    const allBusyTimes = mergeBusyTimes([
      ...calendarBusyTimes,
      ...bookingBusyTimes,
    ]);

    const slotAvailable = isSlotAvailable(
      { start: startDate, end: endDate },
      allBusyTimes,
      eventType.bufferTimeBefore,
      eventType.bufferTimeAfter
    );

    if (!slotAvailable) {
      return NextResponse.json(
        { error: 'This time slot is no longer available. Please select another time.' },
        { status: 409 }
      );
    }

    // Check minimum notice
    const minimumNoticeTime = addMinutes(new Date(), eventType.minimumNotice);
    if (startDate < minimumNoticeTime) {
      return NextResponse.json(
        { error: 'This time slot is too soon. Please select a later time.' },
        { status: 400 }
      );
    }

    // Check daily booking limit
    if (eventType.maxBookingsPerDay) {
      const dateKey = startDate.toISOString().split('T')[0];
      const dayStart = startOfDay(startDate);
      const dayEnd = addMinutes(dayStart, 24 * 60);

      const dayBookings = await prisma.booking.count({
        where: {
          eventTypeId,
          status: { in: ['PENDING', 'CONFIRMED'] },
          startTime: { gte: dayStart, lt: dayEnd },
        },
      });

      if (dayBookings >= eventType.maxBookingsPerDay) {
        return NextResponse.json(
          { error: 'No more bookings available for this day.' },
          { status: 409 }
        );
      }
    }

    // ========================================================================
    // RECURRING: Validate additional slots if recurring booking
    // ========================================================================
    const occurrenceCount = recurring ? recurring.weeks : 1;
    const recurringGroupId = recurring ? nanoid() : undefined;

    // Generate all occurrence dates using the frequency-aware utility
    const allOccurrenceDates = recurring && occurrenceCount > 1
      ? generateRecurringDates(startDate, {
          frequency: recurringFrequency,
          count: occurrenceCount,
          interval: recurringInterval,
        })
      : [startDate];

    // For recurring bookings, validate all future occurrence slots
    if (recurring && occurrenceCount > 1) {
      for (let i = 1; i < occurrenceCount; i++) {
        const occStart = allOccurrenceDates[i];
        const occEnd = addMinutes(occStart, eventType.length);

        // Check availability for each recurring occurrence
        const occBusyTimes = await getAllBusyTimes(
          selectedHost.id,
          addMinutes(occStart, -60),
          addMinutes(occEnd, 60)
        );

        const occBookings = await prisma.booking.findMany({
          where: {
            hostId: selectedHost.id,
            status: { in: ['PENDING', 'CONFIRMED'] },
            startTime: { lt: occEnd },
            endTime: { gt: occStart },
          },
        });

        const occBookingBusy = occBookings
          .filter((b) => !isGroupEvent || b.eventTypeId !== eventTypeId)
          .map((b) => ({ start: b.startTime, end: b.endTime }));

        const occAllBusy = mergeBusyTimes([...occBusyTimes, ...occBookingBusy]);
        const occAvailable = isSlotAvailable(
          { start: occStart, end: occEnd },
          occAllBusy,
          eventType.bufferTimeBefore,
          eventType.bufferTimeAfter
        );

        if (!occAvailable) {
          return NextResponse.json(
            {
              error: `The time slot on ${formatInTimeZone(occStart, timezone, 'EEEE, MMMM d, yyyy')} (week ${i + 1}) is not available. Please choose a different time.`,
              conflictWeek: i + 1,
            },
            { status: 409 }
          );
        }

        // Check daily booking limit for recurring slot
        if (eventType.maxBookingsPerDay) {
          const occDayStart = startOfDay(occStart);
          const occDayEnd = addMinutes(occDayStart, 24 * 60);
          const occDayBookings = await prisma.booking.count({
            where: {
              eventTypeId,
              status: { in: ['PENDING', 'CONFIRMED'] },
              startTime: { gte: occDayStart, lt: occDayEnd },
            },
          });
          if (occDayBookings >= eventType.maxBookingsPerDay) {
            return NextResponse.json(
              {
                error: `No more bookings available on ${formatInTimeZone(occStart, timezone, 'EEEE, MMMM d, yyyy')} (week ${i + 1}).`,
                conflictWeek: i + 1,
              },
              { status: 409 }
            );
          }
        }
      }
    }

    // Determine location
    let location: string | undefined;
    let meetingUrl: string | undefined;

    switch (eventType.locationType) {
      case 'GOOGLE_MEET':
        location = 'Google Meet';
        break;
      case 'TEAMS':
        location = 'Microsoft Teams';
        break;
      case 'ZOOM':
        location = 'Zoom';
        break;
      case 'IN_PERSON':
        location = eventType.locationValue ?? 'In Person';
        break;
      case 'PHONE':
        location = `Phone: ${phone ?? 'TBD'}`;
        break;
      case 'CUSTOM':
        location = eventType.locationValue ?? undefined;
        break;
    }

    // ========================================================================
    // CREATE BOOKINGS (single or recurring)
    // ========================================================================
    const bookingStatus = eventType.requiresConfirmation ? 'PENDING' : 'CONFIRMED';
    const createdBookings: Array<{
      id: string;
      uid: string;
      status: string;
      startTime: Date;
      endTime: Date;
      meetingUrl: string | null;
    }> = [];

    for (let i = 0; i < occurrenceCount; i++) {
      const occStart = allOccurrenceDates[i];
      const occEnd = addMinutes(occStart, eventType.length);

      const booking = await prisma.booking.create({
        data: {
          eventTypeId,
          hostId: selectedHost.id,
          assignedUserId: assignedUserId,
          startTime: occStart,
          endTime: occEnd,
          timezone,
          inviteeName: name,
          inviteeEmail: email,
          inviteePhone: phone,
          inviteeNotes: notes,
          responses: responses ?? undefined,
          status: bookingStatus,
          location,
          source: 'web',
          recurringGroupId,
          recurringIndex: recurring ? i : undefined,
          recurringCount: recurring ? occurrenceCount : undefined,
          recurringFrequency: recurring ? recurringFrequency : undefined,
          recurringInterval: recurring ? recurringInterval : undefined,
        },
      });

      createdBookings.push({
        id: booking.id,
        uid: booking.uid,
        status: booking.status,
        startTime: booking.startTime,
        endTime: booking.endTime,
        meetingUrl: null,
      });
    }

    // Update round-robin state for team events (once)
    if (shouldUpdateRoundRobinState && assignedUserId && eventType.teamId) {
      const assignedMemberRecord = eventType.teamMemberAssignments.find(
        a => a.teamMember.user.id === assignedUserId
      );
      if (assignedMemberRecord) {
        await prisma.eventType.update({
          where: { id: eventTypeId },
          data: { lastAssignedMemberId: assignedMemberRecord.teamMember.id },
        });
      }
    }

    // ========================================================================
    // CALENDAR EVENTS — create one per booking
    // ========================================================================
    let calendarForEvent = await prisma.calendar.findFirst({
      where: {
        userId: selectedHost.id,
        isPrimary: true,
        isEnabled: true,
      },
    });

    let needsConferenceData = false;

    if (eventType.locationType === 'GOOGLE_MEET') {
      const googleCalendar = await prisma.calendar.findFirst({
        where: { userId: selectedHost.id, provider: 'GOOGLE', isEnabled: true },
      });
      if (googleCalendar) {
        calendarForEvent = googleCalendar;
        needsConferenceData = true;
      }
    } else if (eventType.locationType === 'TEAMS') {
      const outlookCalendar = await prisma.calendar.findFirst({
        where: { userId: selectedHost.id, provider: 'OUTLOOK', isEnabled: true },
      });
      if (outlookCalendar) {
        calendarForEvent = outlookCalendar;
        needsConferenceData = true;
      }
    }

    // Create calendar events for each booking
    for (const booking of createdBookings) {
      if (calendarForEvent) {
        try {
          const occSuffix = recurring ? ` (${createdBookings.indexOf(booking) + 1}/${occurrenceCount})` : '';
          const eventParams: CreateCalendarEventParams = {
            calendarId: calendarForEvent.id,
            summary: `${eventType.title} with ${name}${occSuffix}`,
            description: `Booked via TimeTide\n\nInvitee: ${name} (${email})\n${notes ? `Notes: ${notes}` : ''}${recurring ? `\nRecurring: Week ${createdBookings.indexOf(booking) + 1} of ${occurrenceCount}` : ''}`,
            startTime: booking.startTime,
            endTime: booking.endTime,
            attendees: [
              { email, name },
              { email: selectedHost.email!, name: selectedHost.name ?? undefined },
            ],
            location,
            conferenceData: needsConferenceData,
          };

          let result: CreateCalendarEventResult = { eventId: null, meetLink: null };

          if (calendarForEvent.provider === 'GOOGLE') {
            result = await createGoogleCalendarEvent(eventParams);
          } else if (calendarForEvent.provider === 'OUTLOOK') {
            result = await createOutlookCalendarEvent(eventParams);
          }

          if (result.eventId) {
            await prisma.booking.update({
              where: { id: booking.id },
              data: {
                calendarEventId: result.eventId,
                meetingUrl: result.meetLink || undefined,
              },
            });
            booking.meetingUrl = result.meetLink || null;
          }
        } catch (error) {
          console.error(`Failed to create calendar event for booking ${booking.id}:`, error);
        }
      }

      // Create Zoom meeting if needed
      if (eventType.locationType === 'ZOOM') {
        try {
          const hasZoom = await hasZoomConnected(selectedHost.id);
          if (hasZoom) {
            const zoomMeeting = await createZoomMeeting({
              userId: selectedHost.id,
              topic: `${eventType.title} with ${name}`,
              startTime: booking.startTime,
              duration: eventType.length,
              timezone,
              agenda: notes || `Booked via TimeTide with ${name} (${email})`,
            });

            await prisma.booking.update({
              where: { id: booking.id },
              data: { meetingUrl: zoomMeeting.joinUrl },
            });
            booking.meetingUrl = zoomMeeting.joinUrl;
          }
        } catch (error) {
          console.error(`Failed to create Zoom meeting for booking ${booking.id}:`, error);
        }
      }
    }

    // Use first booking as the "primary" for emails/notifications
    const primaryBooking = createdBookings[0];
    meetingUrl = primaryBooking.meetingUrl || undefined;

    // ========================================================================
    // EMAILS & NOTIFICATIONS
    // ========================================================================
    const emailData: BookingEmailData = {
      hostName: selectedHost.name ?? 'Host',
      hostEmail: selectedHost.email!,
      hostUsername: selectedHost.username ?? undefined,
      inviteeName: name,
      inviteeEmail: email,
      eventTitle: eventType.title,
      eventSlug: eventType.slug,
      eventDescription: eventType.description ?? undefined,
      startTime: formatInTimeZone(startDate, timezone, 'EEEE, MMMM d, yyyy h:mm a'),
      endTime: formatInTimeZone(createdBookings[0].endTime, timezone, 'h:mm a'),
      timezone,
      location,
      meetingUrl: meetingUrl ?? undefined,
      bookingUid: primaryBooking.uid,
      notes,
    };

    if (eventType.requiresConfirmation) {
      queueBookingPendingEmails(emailData).catch(console.error);
    } else if (recurring && occurrenceCount > 1) {
      // Send recurring-specific confirmation email with all dates
      const recurringEmailData: RecurringBookingEmailData = {
        ...emailData,
        totalOccurrences: occurrenceCount,
        frequencyLabel: FREQUENCY_LABELS[recurringFrequency]?.toLowerCase() || 'recurring',
        recurringDates: createdBookings.map(b => ({
          startTime: formatInTimeZone(b.startTime, timezone, 'EEEE, MMMM d, yyyy h:mm a'),
          endTime: formatInTimeZone(b.endTime, timezone, 'h:mm a'),
        })),
      };
      queueRecurringBookingConfirmationEmails(recurringEmailData).catch(console.error);

      // Schedule reminders for each booking
      for (const booking of createdBookings) {
        scheduleBookingReminders(booking.id, booking.uid, booking.startTime).catch(console.error);
      }
    } else {
      queueBookingConfirmationEmails(emailData).catch(console.error);

      // Schedule reminders for each booking
      for (const booking of createdBookings) {
        scheduleBookingReminders(booking.id, booking.uid, booking.startTime).catch(console.error);
      }
    }

    // Update analytics (count all occurrences)
    prisma.bookingAnalytics.upsert({
      where: {
        eventTypeId_date: {
          eventTypeId,
          date: startOfDay(new Date()),
        },
      },
      create: {
        eventTypeId,
        date: startOfDay(new Date()),
        bookings: occurrenceCount,
      },
      update: {
        bookings: { increment: occurrenceCount },
      },
    }).catch((err) => { console.warn('Analytics update failed:', err); });

    // Trigger webhook once
    triggerBookingCreatedWebhook(selectedHost.id, {
      id: primaryBooking.id,
      uid: primaryBooking.uid,
      status: primaryBooking.status,
      startTime: startDate,
      endTime: endDate,
      timezone,
      location,
      meetingUrl,
      inviteeName: name,
      inviteeEmail: email,
      inviteePhone: phone,
      inviteeNotes: notes,
      responses: responses ?? null,
      eventType: {
        id: eventType.id,
        title: eventType.title,
        slug: eventType.slug,
        length: eventType.length,
      },
      host: {
        id: selectedHost.id,
        name: selectedHost.name,
        email: selectedHost.email!,
      },
    }).catch(console.error);

    // Create in-app notification for host
    const notifData = buildBookingNotification('BOOKING_CREATED', {
      inviteeName: name,
      eventTitle: eventType.title,
      startTime: recurring
        ? `${occurrenceCount} ${FREQUENCY_LABELS[recurringFrequency] || 'recurring'} sessions starting ${formatInTimeZone(startDate, selectedHost.timezone || 'UTC', 'MMM d, h:mm a')}`
        : formatInTimeZone(startDate, selectedHost.timezone || 'UTC', 'MMM d, h:mm a'),
    });
    createNotification({
      userId: selectedHost.id,
      type: 'BOOKING_CREATED',
      ...notifData,
      bookingId: primaryBooking.id,
    }).catch(console.error);

    return NextResponse.json({
      success: true,
      booking: {
        uid: primaryBooking.uid,
        status: primaryBooking.status,
        startTime: primaryBooking.startTime,
        endTime: primaryBooking.endTime,
        meetingUrl: primaryBooking.meetingUrl,
      },
      isRecurring: !!recurring,
      recurringBookings: recurring ? createdBookings.map(b => ({
        uid: b.uid,
        startTime: b.startTime,
        endTime: b.endTime,
      })) : undefined,
    }, { status: 201 });
  } catch (error) {
    console.error('POST booking error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
