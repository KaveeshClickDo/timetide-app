/**
 * /api/bookings
 * GET: List user's bookings (authenticated)
 * POST: Create a new booking (public)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { addMinutes, addDays, parseISO } from 'date-fns';
import { generateRecurringDates, type RecurringFrequency } from '@/lib/scheduling/recurring/utils';
import { nanoid } from 'nanoid';
import prisma from '@/lib/prisma';
import { Prisma, BookingStatus } from '@/generated/prisma/client';
import { authOptions } from '@/lib/auth';
import { createBookingSchema } from '@/lib/validation/schemas';
import { isSlotAvailable } from '@/lib/scheduling/slots/calculator';
import { verifyCode } from '@/lib/email-verification';
import { PLAN_LIMITS, type PlanTier } from '@/lib/pricing';
import { checkBookingRateLimit } from '@/lib/infrastructure/queue';
import {
  selectTeamMember,
  TeamSelectionError,
  validateSlotAvailability,
  SlotUnavailableError,
  MinimumNoticeError,
  validateRecurringSlots,
  RecurringSlotError,
  createCalendarEvents,
  sendBookingNotifications,
  type HostInfo,
} from '@/lib/services/booking';

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

    // Include bookings where user is host, assigned member, or a collective team member
    const userFilter: Prisma.BookingWhereInput = {
      OR: [
        { hostId: session.user.id },
        { assignedUserId: session.user.id },
        {
          eventType: {
            teamMemberAssignments: {
              some: {
                isActive: true,
                teamMember: {
                  userId: session.user.id,
                },
              },
            },
          },
        },
      ],
    };

    const where: Prisma.BookingWhereInput = { ...userFilter };

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
            schedulingType: true,
            team: {
              select: {
                id: true,
                name: true,
              },
            },
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

    // Verify email ownership via HMAC code
    const ev = body.emailVerification;
    if (!ev?.code || !ev?.signature || !ev?.expiresAt) {
      return NextResponse.json(
        { error: 'Email verification is required to create a booking' },
        { status: 400 }
      );
    }
    const verification = verifyCode(email, ev.code, 'BOOKING_CREATE', ev.signature, ev.expiresAt);
    if (!verification.valid) {
      return NextResponse.json(
        { error: verification.error || 'Email verification failed' },
        { status: 403 }
      );
    }

    // Fetch event type with team member assignments
    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId, isActive: true, lockedByDowngrade: false },
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

    // For team event types, verify the team owner still has a TEAM plan
    if (eventType.teamId) {
      const teamOwner = await prisma.teamMember.findFirst({
        where: { teamId: eventType.teamId, role: 'OWNER' },
        select: { user: { select: { plan: true } } },
      });
      const ownerPlan = (teamOwner?.user?.plan || 'FREE') as PlanTier;
      if (!PLAN_LIMITS[ownerPlan]?.teams) {
        return NextResponse.json(
          { error: 'This team event type is currently unavailable' },
          { status: 404 }
        );
      }
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

    // ========================================================================
    // TEAM MEMBER SELECTION
    // ========================================================================
    const eventOwner: HostInfo = {
      id: eventType.userId,
      name: eventType.user.name,
      email: eventType.user.email,
      username: eventType.user.username,
      timezone: eventType.user.timezone,
    };

    let selectedHost = eventOwner;
    let assignedUserId: string | undefined;
    let shouldUpdateRoundRobinState = false;

    if (eventType.teamId && eventType.schedulingType && eventType.teamMemberAssignments.length > 0) {
      const result = await selectTeamMember({
        schedulingType: eventType.schedulingType as 'ROUND_ROBIN' | 'COLLECTIVE' | 'MANAGED',
        teamMemberAssignments: eventType.teamMemberAssignments,
        lastAssignedMemberId: eventType.lastAssignedMemberId,
        meetingOrganizerUserId: eventType.meetingOrganizerUserId,
        eventOwner,
        startDate,
        endDate,
        bufferTimeBefore: eventType.bufferTimeBefore,
        bufferTimeAfter: eventType.bufferTimeAfter,
      });

      selectedHost = result.selectedHost;
      assignedUserId = result.assignedUserId;
      shouldUpdateRoundRobinState = result.shouldUpdateRoundRobinState;
    }

    // ========================================================================
    // SLOT AVAILABILITY VALIDATION
    // ========================================================================
    await validateSlotAvailability({
      hostId: selectedHost.id,
      eventTypeId,
      startDate,
      endDate,
      bufferTimeBefore: eventType.bufferTimeBefore,
      bufferTimeAfter: eventType.bufferTimeAfter,
      minimumNotice: eventType.minimumNotice,
      maxBookingsPerDay: eventType.maxBookingsPerDay,
      seatsPerSlot: eventType.seatsPerSlot ?? 1,
    });

    // ========================================================================
    // RECURRING SLOT VALIDATION
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

    if (recurring && occurrenceCount > 1) {
      await validateRecurringSlots({
        hostId: selectedHost.id,
        eventTypeId,
        allOccurrenceDates,
        eventLength: eventType.length,
        timezone,
        bufferTimeBefore: eventType.bufferTimeBefore,
        bufferTimeAfter: eventType.bufferTimeAfter,
        maxBookingsPerDay: eventType.maxBookingsPerDay,
        seatsPerSlot: eventType.seatsPerSlot ?? 1,
      });
    }

    // ========================================================================
    // DETERMINE LOCATION
    // ========================================================================
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
    // CREATE BOOKINGS (single or recurring) — Serializable transaction
    // ========================================================================
    const isManagedUnassigned = eventType.schedulingType === 'MANAGED' && !assignedUserId;
    const bookingStatus = (eventType.requiresConfirmation || isManagedUnassigned) ? 'PENDING' : 'CONFIRMED';
    const isGroupEvent = (eventType.seatsPerSlot ?? 1) > 1;
    const seatsPerSlot = eventType.seatsPerSlot ?? 1;

    const createdBookings: Array<{
      id: string;
      uid: string;
      status: string;
      startTime: Date;
      endTime: Date;
      meetingUrl: string | null;
    }> = [];

    // All-or-nothing transaction with serialization conflict retry
    const MAX_SERIALIZATION_RETRIES = 3;
    const conflictedMemberIds = new Set<string>();

    for (let attempt = 0; attempt < MAX_SERIALIZATION_RETRIES; attempt++) {
      try {
        const txResult = await prisma.$transaction(
          async (tx) => {
            const txBookings: Array<{
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

              // Re-check seat availability inside Serializable transaction
              if (isGroupEvent) {
                const currentCount = await tx.booking.count({
                  where: {
                    eventTypeId,
                    startTime: occStart,
                    status: { in: ['PENDING', 'CONFIRMED'] },
                  },
                });
                if (currentCount >= seatsPerSlot) {
                  throw new Error('SEATS_FULL');
                }
              }

              // Guard against round-robin race condition
              if (assignedUserId) {
                const memberConflict = await tx.booking.findFirst({
                  where: {
                    OR: [
                      { hostId: assignedUserId },
                      { assignedUserId: assignedUserId },
                      { attendees: { some: { userId: assignedUserId } } },
                    ],
                    status: { in: ['PENDING', 'CONFIRMED'] },
                    startTime: { lt: occEnd },
                    endTime: { gt: occStart },
                  },
                });
                if (memberConflict) {
                  throw new Error('MEMBER_CONFLICT');
                }
              }

              const booking = await tx.booking.create({
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

              txBookings.push({
                id: booking.id,
                uid: booking.uid,
                status: booking.status,
                startTime: booking.startTime,
                endTime: booking.endTime,
                meetingUrl: null,
              });
            }

            // Create BookingAttendee records for collective team members (non-host)
            if (eventType.schedulingType === 'COLLECTIVE' && eventType.teamMemberAssignments.length > 0) {
              const nonHostMembers = eventType.teamMemberAssignments.filter(
                a => a.teamMember.user.id !== selectedHost.id
              );
              for (const booking of txBookings) {
                await tx.bookingAttendee.createMany({
                  data: nonHostMembers.map(a => ({
                    bookingId: booking.id,
                    email: a.teamMember.user.email!,
                    name: a.teamMember.user.name ?? undefined,
                    userId: a.teamMember.user.id,
                  })),
                });
              }
            }

            // Update round-robin state with optimistic locking
            if (shouldUpdateRoundRobinState && assignedUserId && eventType.teamId) {
              const assignedMemberRecord = eventType.teamMemberAssignments.find(
                a => a.teamMember.user.id === assignedUserId
              );
              if (assignedMemberRecord) {
                const expectedLastMemberId = eventType.lastAssignedMemberId;
                const updated = await tx.eventType.updateMany({
                  where: {
                    id: eventTypeId,
                    lastAssignedMemberId: expectedLastMemberId ?? null,
                  },
                  data: { lastAssignedMemberId: assignedMemberRecord.teamMember.id },
                });
                if (updated.count === 0) {
                  throw new Error('ROUND_ROBIN_CONFLICT');
                }
              }
            }

            return txBookings;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );

        // Transaction succeeded
        createdBookings.push(...txResult);
        break;
      } catch (txError) {
        const isSerializationFailure =
          txError instanceof Error &&
          'code' in txError &&
          (txError as { code: string }).code === 'P2034';
        const isRoundRobinConflict =
          txError instanceof Error &&
          (txError.message === 'MEMBER_CONFLICT' || txError.message === 'ROUND_ROBIN_CONFLICT');

        if ((isSerializationFailure || isRoundRobinConflict) && attempt < MAX_SERIALIZATION_RETRIES - 1) {
          // On round-robin conflicts, re-select the next available member
          if (isRoundRobinConflict && shouldUpdateRoundRobinState && eventType.schedulingType === 'ROUND_ROBIN') {
            if (assignedUserId) {
              conflictedMemberIds.add(assignedUserId);
            }

            // Re-read current round-robin state from DB
            const freshEventType = await prisma.eventType.findUnique({
              where: { id: eventTypeId },
              select: { lastAssignedMemberId: true },
            });
            if (freshEventType) {
              eventType.lastAssignedMemberId = freshEventType.lastAssignedMemberId;
            }

            // Re-run member selection, skipping conflicted members
            const assignedMembers = eventType.teamMemberAssignments.map(a => a.teamMember);
            const freshLastIndex = eventType.lastAssignedMemberId
              ? assignedMembers.findIndex(m => m.id === eventType.lastAssignedMemberId)
              : -1;

            let newMemberIndex = freshLastIndex;
            let foundMember = false;

            for (let j = 0; j < assignedMembers.length; j++) {
              newMemberIndex = (newMemberIndex + 1) % assignedMembers.length;
              const candidate = assignedMembers[newMemberIndex];

              if (conflictedMemberIds.has(candidate.user.id)) continue;

              const candidateBookings = await prisma.booking.findMany({
                where: {
                  OR: [
                    { hostId: candidate.user.id },
                    { assignedUserId: candidate.user.id },
                    { attendees: { some: { userId: candidate.user.id } } },
                  ],
                  status: { in: ['PENDING', 'CONFIRMED'] },
                  startTime: { lt: endDate },
                  endTime: { gt: startDate },
                },
              });

              const candidateBusy = candidateBookings.map(b => ({ start: b.startTime, end: b.endTime }));
              const candidateAvailable = isSlotAvailable(
                { start: startDate, end: endDate },
                candidateBusy,
                eventType.bufferTimeBefore,
                eventType.bufferTimeAfter
              );

              if (candidateAvailable) {
                selectedHost = {
                  id: candidate.user.id,
                  name: candidate.user.name,
                  email: candidate.user.email,
                  username: candidate.user.username,
                  timezone: candidate.user.timezone,
                };
                assignedUserId = candidate.user.id;
                foundMember = true;
                break;
              } else {
                conflictedMemberIds.add(candidate.user.id);
              }
            }

            if (!foundMember) {
              throw new Error('MEMBER_CONFLICT');
            }
          }

          await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
          continue;
        }
        // Not retryable or final retry exhausted
        throw txError;
      }
    }

    // ========================================================================
    // CALENDAR EVENTS (with compensation on catastrophic failure)
    // ========================================================================
    try {
      await createCalendarEvents({
        createdBookings,
        selectedHost,
        meetingOrganizerUserId: eventType.meetingOrganizerUserId,
        eventTitle: eventType.title,
        eventLength: eventType.length,
        locationType: eventType.locationType,
        bookingStatus,
        inviteeName: name,
        inviteeEmail: email,
        notes,
        location,
        isRecurring: !!recurring,
        occurrenceCount,
        schedulingType: eventType.schedulingType,
        teamMemberAssignments: eventType.teamMemberAssignments,
      });

      // ========================================================================
      // EMAILS, WEBHOOKS & NOTIFICATIONS (fire-and-forget, inside try block
      // so they only fire after successful calendar creation)
      // ========================================================================
      const primaryBooking = createdBookings[0];
      meetingUrl = primaryBooking.meetingUrl || undefined;

      sendBookingNotifications({
        selectedHost,
        createdBookings,
        eventTypeId,
        eventTitle: eventType.title,
        eventSlug: eventType.slug,
        eventDescription: eventType.description,
        eventLength: eventType.length,
        requiresConfirmation: eventType.requiresConfirmation,
        inviteeName: name,
        inviteeEmail: email,
        inviteePhone: phone,
        inviteeNotes: notes,
        responses,
        timezone,
        location,
        meetingUrl,
        isRecurring: !!recurring,
        occurrenceCount,
        recurringFrequency,
        schedulingType: eventType.schedulingType,
        teamMemberAssignments: eventType.teamMemberAssignments,
      });

      // ========================================================================
      // RESPONSE
      // ========================================================================
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
    } catch (calendarError) {
      // Calendar creation failed catastrophically — compensate by deleting bookings
      console.error('Calendar event creation failed, rolling back bookings:', calendarError);
      try {
        await prisma.booking.deleteMany({
          where: { id: { in: createdBookings.map(b => b.id) } },
        });
      } catch (rollbackError) {
        console.error('Failed to rollback bookings after calendar failure:', rollbackError);
      }
      return NextResponse.json(
        { error: 'Failed to create calendar events. Please try again.' },
        { status: 500 }
      );
    }
  } catch (error) {
    // Map domain errors to HTTP responses
    if (error instanceof TeamSelectionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof MinimumNoticeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SlotUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof RecurringSlotError) {
      return NextResponse.json(
        { error: error.message, conflictWeek: error.conflictWeek },
        { status: 409 }
      );
    }
    // Handle group booking seat capacity exceeded (from transaction re-check)
    if (error instanceof Error && error.message === 'SEATS_FULL') {
      return NextResponse.json(
        { error: 'All seats for this time slot are taken. Please select another time.' },
        { status: 409 }
      );
    }
    // Handle round-robin or member conflicts (concurrent booking assigned same member)
    if (error instanceof Error && (error.message === 'MEMBER_CONFLICT' || error.message === 'ROUND_ROBIN_CONFLICT')) {
      return NextResponse.json(
        { error: 'This time slot was just booked. Please select another time.' },
        { status: 409 }
      );
    }
    // Handle Prisma serialization failure (concurrent booking conflict under Serializable isolation)
    if (
      error instanceof Error &&
      'code' in error &&
      (error as { code: string }).code === 'P2034'
    ) {
      return NextResponse.json(
        { error: 'This time slot was just booked by someone else. Please select another time.' },
        { status: 409 }
      );
    }
    console.error('POST booking error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
