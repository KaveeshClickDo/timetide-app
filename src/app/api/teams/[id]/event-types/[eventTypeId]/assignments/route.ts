/**
 * /api/teams/[id]/event-types/[eventTypeId]/assignments
 * GET: List assigned members
 * POST: Assign member to event type
 * DELETE: Remove member assignment
 */

import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

interface RouteParams {
  params: { id: string; eventTypeId: string };
}

const assignMemberSchema = z.object({
  memberId: z.string().min(1, 'Member ID is required'),
});

const removeMemberSchema = z.object({
  memberId: z.string().min(1, 'Member ID is required'),
});

/**
 * Helper to check team access and get current user's role
 */
async function checkTeamAccess(teamId: string, userId: string) {
  const membership = await prisma.teamMember.findUnique({
    where: {
      teamId_userId: {
        teamId,
        userId,
      },
    },
  });

  return membership;
}

/**
 * Helper to verify event type belongs to team
 */
async function verifyEventType(eventTypeId: string, teamId: string) {
  const eventType = await prisma.eventType.findFirst({
    where: {
      id: eventTypeId,
      teamId: teamId,
    },
  });

  return eventType;
}

// GET /api/teams/[id]/event-types/[eventTypeId]/assignments - List assigned members
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is a team member
    const membership = await checkTeamAccess(params.id, session.user.id);
    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this team' }, { status: 403 });
    }

    // Verify event type belongs to team
    const eventType = await verifyEventType(params.eventTypeId, params.id);
    if (!eventType) {
      return NextResponse.json({ error: 'Event type not found' }, { status: 404 });
    }

    const assignments = await prisma.eventTypeAssignment.findMany({
      where: { eventTypeId: params.eventTypeId },
      include: {
        teamMember: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ assignments });
  } catch (error) {
    console.error('Error listing event type assignments:', error);
    return NextResponse.json(
      { error: 'Failed to list assignments' },
      { status: 500 }
    );
  }
}

// POST /api/teams/[id]/event-types/[eventTypeId]/assignments - Assign member
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin/owner
    const membership = await checkTeamAccess(params.id, session.user.id);
    if (!membership || membership.role === 'MEMBER') {
      return NextResponse.json(
        { error: 'Not authorized to manage assignments' },
        { status: 403 }
      );
    }

    // Verify event type belongs to team
    const eventType = await verifyEventType(params.eventTypeId, params.id);
    if (!eventType) {
      return NextResponse.json({ error: 'Event type not found' }, { status: 404 });
    }

    const body = await request.json();
    const result = assignMemberSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    const { memberId } = result.data;

    // Verify member belongs to team
    const teamMember = await prisma.teamMember.findFirst({
      where: {
        id: memberId,
        teamId: params.id,
      },
    });

    if (!teamMember) {
      return NextResponse.json(
        { error: 'Member not found in this team' },
        { status: 404 }
      );
    }

    // Check if already assigned
    const existingAssignment = await prisma.eventTypeAssignment.findUnique({
      where: {
        eventTypeId_teamMemberId: {
          eventTypeId: params.eventTypeId,
          teamMemberId: memberId,
        },
      },
    });

    if (existingAssignment) {
      return NextResponse.json(
        { error: 'Member is already assigned to this event type' },
        { status: 400 }
      );
    }

    const assignment = await prisma.eventTypeAssignment.create({
      data: {
        eventTypeId: params.eventTypeId,
        teamMemberId: memberId,
      },
      include: {
        teamMember: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    console.error('Error assigning member:', error);
    return NextResponse.json(
      { error: 'Failed to assign member' },
      { status: 500 }
    );
  }
}

// DELETE /api/teams/[id]/event-types/[eventTypeId]/assignments - Remove assignment
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin/owner
    const membership = await checkTeamAccess(params.id, session.user.id);
    if (!membership || membership.role === 'MEMBER') {
      return NextResponse.json(
        { error: 'Not authorized to manage assignments' },
        { status: 403 }
      );
    }

    // Verify event type belongs to team
    const eventType = await verifyEventType(params.eventTypeId, params.id);
    if (!eventType) {
      return NextResponse.json({ error: 'Event type not found' }, { status: 404 });
    }

    // Get memberId from query params or body
    const searchParams = request.nextUrl.searchParams;
    let memberId = searchParams.get('memberId');

    if (!memberId) {
      try {
        const body = await request.json();
        const result = removeMemberSchema.safeParse(body);
        if (result.success) {
          memberId = result.data.memberId;
        }
      } catch {
        // No body
      }
    }

    if (!memberId) {
      return NextResponse.json(
        { error: 'Member ID is required' },
        { status: 400 }
      );
    }

    // Find and delete assignment
    const assignment = await prisma.eventTypeAssignment.findUnique({
      where: {
        eventTypeId_teamMemberId: {
          eventTypeId: params.eventTypeId,
          teamMemberId: memberId,
        },
      },
    });

    if (!assignment) {
      return NextResponse.json(
        { error: 'Assignment not found' },
        { status: 404 }
      );
    }

    await prisma.eventTypeAssignment.delete({
      where: { id: assignment.id },
    });

    return NextResponse.json({ success: true, message: 'Assignment removed' });
  } catch (error) {
    console.error('Error removing assignment:', error);
    return NextResponse.json(
      { error: 'Failed to remove assignment' },
      { status: 500 }
    );
  }
}
