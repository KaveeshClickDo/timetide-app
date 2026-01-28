/**
 * /api/public/team-event-types
 * GET: Fetch public team event type information for booking
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const teamSlug = searchParams.get('teamSlug');
    const eventSlug = searchParams.get('slug');

    if (!teamSlug || !eventSlug) {
      return NextResponse.json(
        { error: 'Team slug and event slug are required' },
        { status: 400 }
      );
    }

    // Find team
    const team = await prisma.team.findUnique({
      where: { slug: teamSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        logo: true,
      },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Find event type
    const eventType = await prisma.eventType.findFirst({
      where: {
        teamId: team.id,
        slug: eventSlug,
        isActive: true,
      },
      include: {
        questions: {
          orderBy: { order: 'asc' },
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
                    image: true,
                    timezone: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!eventType) {
      return NextResponse.json({ error: 'Event type not found' }, { status: 404 });
    }

    // Get assigned members with their info
    const members = eventType.teamMemberAssignments.map((assignment) => ({
      id: assignment.teamMember.user.id,
      name: assignment.teamMember.user.name,
      image: assignment.teamMember.user.image,
      timezone: assignment.teamMember.user.timezone,
      priority: assignment.teamMember.priority,
    }));

    // Use the first member's timezone as default, or UTC
    const defaultTimezone = members[0]?.timezone || 'UTC';

    return NextResponse.json({
      team: {
        id: team.id,
        name: team.name,
        slug: team.slug,
        description: team.description,
        logo: team.logo,
      },
      eventType: {
        id: eventType.id,
        title: eventType.title,
        description: eventType.description,
        length: eventType.length,
        locationType: eventType.locationType,
        schedulingType: eventType.schedulingType,
        requiresConfirmation: eventType.requiresConfirmation,
        questions: eventType.questions.map((q) => ({
          id: q.id,
          type: q.type,
          label: q.label,
          required: q.required,
          placeholder: q.placeholder,
          options: q.options,
        })),
      },
      members,
      defaultTimezone,
    });
  } catch (error) {
    console.error('Error fetching team event type:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
