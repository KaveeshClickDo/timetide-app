/**
 * /api/public/teams/[teamSlug]
 * GET: Fetch public team information and event types for team landing page
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteParams {
  params: { teamSlug: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { teamSlug } = params;

    if (!teamSlug) {
      return NextResponse.json(
        { error: 'Team slug is required' },
        { status: 400 }
      );
    }

    // Find team with active event types
    const team = await prisma.team.findUnique({
      where: { slug: teamSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        logo: true,
        members: {
          where: { isActive: true },
          select: {
            id: true,
            user: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
          take: 10, // Limit to first 10 members for display
        },
        eventTypes: {
          where: { isActive: true },
          select: {
            id: true,
            title: true,
            slug: true,
            description: true,
            length: true,
            locationType: true,
            schedulingType: true,
            teamMemberAssignments: {
              where: { isActive: true },
              select: {
                teamMember: {
                  select: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        image: true,
                      },
                    },
                  },
                },
              },
              take: 5,
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Format response
    return NextResponse.json({
      team: {
        id: team.id,
        name: team.name,
        slug: team.slug,
        description: team.description,
        logo: team.logo,
        memberCount: team.members.length,
        members: team.members.map((m) => ({
          id: m.user.id,
          name: m.user.name,
          image: m.user.image,
        })),
      },
      eventTypes: team.eventTypes.map((et) => ({
        id: et.id,
        title: et.title,
        slug: et.slug,
        description: et.description,
        length: et.length,
        locationType: et.locationType,
        schedulingType: et.schedulingType,
        assignedMembers: et.teamMemberAssignments.map((a) => ({
          id: a.teamMember.user.id,
          name: a.teamMember.user.name,
          image: a.teamMember.user.image,
        })),
      })),
    });
  } catch (error) {
    console.error('Error fetching team:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
