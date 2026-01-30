/**
 * /api/bookings/[id]/assign
 * POST: Assign a team member to a booking (for MANAGED scheduling type)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { formatInTimeZone } from 'date-fns-tz';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';
import { queueBookingConfirmationEmails, scheduleBookingReminders } from '@/lib/queue';
import { BookingEmailData } from '@/lib/email/client';

const assignMemberSchema = z.object({
  assignedUserId: z.string().min(1, 'Member ID is required'),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/bookings/[id]/assign
 * Assign a team member to a booking
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate body
    const body = await request.json();
    const validated = assignMemberSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { assignedUserId } = validated.data;

    // Find the booking
    const booking = await prisma.booking.findFirst({
      where: {
        OR: [{ id }, { uid: id }],
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      include: {
        eventType: {
          include: {
            team: {
              include: {
                members: {
                  where: {
                    userId: session.user.id,
                    role: { in: ['OWNER', 'ADMIN'] },
                  },
                },
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
                        timezone: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        host: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found or cannot be modified' },
        { status: 404 }
      );
    }

    // Check authorization - must be team admin/owner or host
    const isTeamAdmin =
      booking.eventType.team?.members && booking.eventType.team.members.length > 0;
    const isHost = booking.hostId === session.user.id;

    if (!isTeamAdmin && !isHost) {
      return NextResponse.json(
        { error: 'Only team admins or the host can assign members' },
        { status: 403 }
      );
    }

    // Verify this is a MANAGED scheduling type event
    if (booking.eventType.schedulingType !== 'MANAGED') {
      return NextResponse.json(
        { error: 'Member assignment is only available for MANAGED scheduling type' },
        { status: 400 }
      );
    }

    // Verify the assigned user is an active team member for this event
    const assignedMember = booking.eventType.teamMemberAssignments.find(
      (a) => a.teamMember.user.id === assignedUserId
    );

    if (!assignedMember) {
      return NextResponse.json(
        { error: 'Assigned user is not an active team member for this event type' },
        { status: 400 }
      );
    }

    // Update the booking with the assigned member
    const updatedBooking = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        assignedUserId,
        // If booking was pending and we're assigning, auto-confirm it
        status: booking.status === 'PENDING' ? 'CONFIRMED' : booking.status,
      },
    });

    // If status changed from PENDING to CONFIRMED, send confirmation emails and schedule reminders
    if (booking.status === 'PENDING' && updatedBooking.status === 'CONFIRMED') {
      const assignedUser = assignedMember.teamMember.user;

      const emailData: BookingEmailData = {
        hostName: assignedUser.name ?? 'Team Member',
        hostEmail: assignedUser.email!,
        inviteeName: booking.inviteeName,
        inviteeEmail: booking.inviteeEmail,
        eventTitle: booking.eventType.title,
        eventDescription: booking.eventType.description ?? undefined,
        startTime: formatInTimeZone(
          booking.startTime,
          booking.timezone,
          'EEEE, MMMM d, yyyy h:mm a'
        ),
        endTime: formatInTimeZone(booking.endTime, booking.timezone, 'h:mm a'),
        timezone: booking.timezone,
        location: booking.location ?? undefined,
        meetingUrl: booking.meetingUrl ?? undefined,
        bookingUid: booking.uid,
      };

      // Queue confirmation emails
      queueBookingConfirmationEmails(emailData).catch(console.error);

      // Schedule reminders
      scheduleBookingReminders(booking.id, booking.uid, booking.startTime).catch(
        console.error
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Team member assigned successfully',
      booking: {
        id: updatedBooking.id,
        uid: updatedBooking.uid,
        assignedUserId: updatedBooking.assignedUserId,
        assignedMemberName: assignedMember.teamMember.user.name,
        status: updatedBooking.status,
      },
    });
  } catch (error) {
    console.error('POST assign member error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/bookings/[id]/assign
 * Get available team members for assignment
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find the booking
    const booking = await prisma.booking.findFirst({
      where: {
        OR: [{ id }, { uid: id }],
      },
      include: {
        eventType: {
          include: {
            team: {
              include: {
                members: {
                  where: {
                    userId: session.user.id,
                    role: { in: ['OWNER', 'ADMIN'] },
                  },
                },
              },
            },
            teamMemberAssignments: {
              where: { isActive: true },
              include: {
                teamMember: {
                  where: { isActive: true },
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        email: true,
                        image: true,
                        timezone: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Check authorization
    const isTeamAdmin =
      booking.eventType.team?.members && booking.eventType.team.members.length > 0;
    const isHost = booking.hostId === session.user.id;

    if (!isTeamAdmin && !isHost) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get available members
    const availableMembers = booking.eventType.teamMemberAssignments.map((a) => ({
      id: a.teamMember.user.id,
      teamMemberId: a.teamMember.id,
      name: a.teamMember.user.name,
      email: a.teamMember.user.email,
      image: a.teamMember.user.image,
      timezone: a.teamMember.user.timezone,
      priority: a.teamMember.priority,
    }));

    return NextResponse.json({
      booking: {
        id: booking.id,
        uid: booking.uid,
        assignedUserId: booking.assignedUserId,
        schedulingType: booking.eventType.schedulingType,
      },
      availableMembers,
    });
  } catch (error) {
    console.error('GET available members error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
