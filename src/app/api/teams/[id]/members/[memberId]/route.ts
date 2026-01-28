/**
 * /api/teams/[id]/members/[memberId]
 * GET: Get member details
 * PATCH: Update member role/priority
 * DELETE: Remove member from team
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { updateTeamMemberSchema } from '@/lib/validation/schemas';

interface RouteParams {
  params: { id: string; memberId: string };
}

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

// GET /api/teams/[id]/members/[memberId] - Get member details
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is a team member
    const currentMembership = await checkTeamAccess(params.id, session.user.id);
    if (!currentMembership) {
      return NextResponse.json({ error: 'Not a member of this team' }, { status: 403 });
    }

    const member = await prisma.teamMember.findUnique({
      where: { id: params.memberId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        assignments: {
          include: {
            eventType: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
    });

    if (!member || member.teamId !== params.id) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    return NextResponse.json({ member });
  } catch (error) {
    console.error('Error getting team member:', error);
    return NextResponse.json(
      { error: 'Failed to get team member' },
      { status: 500 }
    );
  }
}

// PATCH /api/teams/[id]/members/[memberId] - Update member
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if current user is admin/owner
    const currentMembership = await checkTeamAccess(params.id, session.user.id);
    if (!currentMembership || currentMembership.role === 'MEMBER') {
      return NextResponse.json({ error: 'Not authorized to update members' }, { status: 403 });
    }

    // Find the target member
    const targetMember = await prisma.teamMember.findUnique({
      where: { id: params.memberId },
    });

    if (!targetMember || targetMember.teamId !== params.id) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Parse and validate body
    const body = await request.json();
    const result = updateTeamMemberSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      );
    }

    const { role, isActive, priority } = result.data;

    // Permission checks for role changes
    if (role) {
      // Only owner can change roles to/from OWNER
      if (
        (role === 'OWNER' || targetMember.role === 'OWNER') &&
        currentMembership.role !== 'OWNER'
      ) {
        return NextResponse.json(
          { error: 'Only owners can modify owner roles' },
          { status: 403 }
        );
      }

      // Can't demote the last owner
      if (targetMember.role === 'OWNER' && role !== 'OWNER') {
        const ownerCount = await prisma.teamMember.count({
          where: {
            teamId: params.id,
            role: 'OWNER',
          },
        });

        if (ownerCount <= 1) {
          return NextResponse.json(
            { error: 'Cannot demote the last owner. Promote another member first.' },
            { status: 400 }
          );
        }
      }
    }

    // Update the member
    const updatedMember = await prisma.teamMember.update({
      where: { id: params.memberId },
      data: {
        ...(role !== undefined && { role }),
        ...(isActive !== undefined && { isActive }),
        ...(priority !== undefined && { priority }),
      },
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
    });

    return NextResponse.json({ member: updatedMember });
  } catch (error) {
    console.error('Error updating team member:', error);
    return NextResponse.json(
      { error: 'Failed to update team member' },
      { status: 500 }
    );
  }
}

// DELETE /api/teams/[id]/members/[memberId] - Remove member
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if current user is admin/owner
    const currentMembership = await checkTeamAccess(params.id, session.user.id);
    if (!currentMembership || currentMembership.role === 'MEMBER') {
      return NextResponse.json({ error: 'Not authorized to remove members' }, { status: 403 });
    }

    // Find the target member
    const targetMember = await prisma.teamMember.findUnique({
      where: { id: params.memberId },
    });

    if (!targetMember || targetMember.teamId !== params.id) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Permission checks
    // Only owner can remove other owners
    if (targetMember.role === 'OWNER' && currentMembership.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Only owners can remove other owners' },
        { status: 403 }
      );
    }

    // Can't remove the last owner
    if (targetMember.role === 'OWNER') {
      const ownerCount = await prisma.teamMember.count({
        where: {
          teamId: params.id,
          role: 'OWNER',
        },
      });

      if (ownerCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot remove the last owner. Transfer ownership first.' },
          { status: 400 }
        );
      }
    }

    // Remove member (this will cascade delete eventTypeAssignments)
    await prisma.teamMember.delete({
      where: { id: params.memberId },
    });

    return NextResponse.json({ success: true, message: 'Member removed successfully' });
  } catch (error) {
    console.error('Error removing team member:', error);
    return NextResponse.json(
      { error: 'Failed to remove team member' },
      { status: 500 }
    );
  }
}
