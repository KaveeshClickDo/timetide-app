/**
 * /api/teams/[id]/members/integrations
 * GET: Get integration connection status for all team members
 * Returns which members have Google Calendar, Outlook, or Zoom connected
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

interface RouteParams {
  params: { id: string };
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check team membership
    const membership = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: params.id,
          userId: session.user.id,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this team' }, { status: 403 });
    }

    // Get all team members with their integration connections
    const members = await prisma.teamMember.findMany({
      where: { teamId: params.id, isActive: true },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            calendars: {
              where: { isEnabled: true },
              select: {
                id: true,
                provider: true,
                name: true,
              },
            },
            zoomCredential: {
              select: {
                id: true,
              },
            },
          },
        },
      },
      orderBy: [
        { role: 'asc' },
        { priority: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    // Transform to a clean response
    const memberIntegrations = members.map((member) => ({
      memberId: member.id,
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
      image: member.user.image,
      integrations: {
        googleCalendar: member.user.calendars.some((c) => c.provider === 'GOOGLE'),
        outlookCalendar: member.user.calendars.some((c) => c.provider === 'OUTLOOK'),
        zoom: !!member.user.zoomCredential,
      },
    }));

    return NextResponse.json({ members: memberIntegrations });
  } catch (error) {
    console.error('Error fetching team member integrations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team member integrations' },
      { status: 500 }
    );
  }
}
