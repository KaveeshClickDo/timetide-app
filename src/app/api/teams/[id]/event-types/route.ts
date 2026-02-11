/**
 * /api/teams/[id]/event-types
 * GET: List team event types
 * POST: Create a team event type
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { checkFeatureAccess, checkEventTypeFeatures } from '@/lib/plan-enforcement';
import type { PlanTier } from '@/lib/pricing';
import {
  slugSchema,
  locationTypeSchema,
  schedulingTypeSchema,
  periodTypeSchema,
  eventTypeQuestionSchema,
} from '@/lib/validation/schemas';

interface RouteParams {
  params: { id: string };
}

// Validation schema for creating team event type
const createTeamEventTypeSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  slug: slugSchema,
  description: z.string().max(5000).optional(),
  length: z.number().int().min(5).max(720),
  bufferTimeBefore: z.number().int().min(0).max(120).default(0),
  bufferTimeAfter: z.number().int().min(0).max(120).default(0),
  minimumNotice: z.number().int().min(0).max(43200).default(60),
  slotInterval: z.number().int().min(5).max(720).optional(),
  periodType: periodTypeSchema.default('ROLLING'),
  periodDays: z.number().int().min(1).max(365).optional(),
  periodStartDate: z.string().datetime().optional(),
  periodEndDate: z.string().datetime().optional(),
  locationType: locationTypeSchema.default('GOOGLE_MEET'),
  locationValue: z.string().max(500).optional(),
  maxBookingsPerDay: z.number().int().min(1).max(100).optional(),
  seatsPerSlot: z.number().int().min(1).max(100).default(1),
  requiresConfirmation: z.boolean().default(false),
  hideNotes: z.boolean().default(false),
  successRedirectUrl: z.string().url().optional(),
  schedulingType: schedulingTypeSchema,
  questions: z.array(eventTypeQuestionSchema).optional(),
  memberIds: z.array(z.string()).optional(), // Team members to assign
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

// GET /api/teams/[id]/event-types - List team event types
export async function GET(request: Request, { params }: RouteParams) {
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

    const eventTypes = await prisma.eventType.findMany({
      where: { teamId: params.id },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
        teamMemberAssignments: {
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
        },
        _count: {
          select: {
            bookings: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ eventTypes });
  } catch (error) {
    console.error('Error listing team event types:', error);
    return NextResponse.json(
      { error: 'Failed to list team event types' },
      { status: 500 }
    );
  }
}

// POST /api/teams/[id]/event-types - Create team event type
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin/owner
    const membership = await checkTeamAccess(params.id, session.user.id);
    if (!membership || membership.role === 'MEMBER') {
      return NextResponse.json(
        { error: 'Not authorized to create team event types' },
        { status: 403 }
      );
    }

    // Enforce teams feature gate + pro feature gates
    const plan = (session.user as any).plan as PlanTier;
    const teamsDenied = checkFeatureAccess(plan, 'teams');
    if (teamsDenied) return teamsDenied;

    const body = await request.json();
    const result = createTeamEventTypeSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: result.error.flatten() },
        { status: 400 }
      );
    }

    // Enforce pro feature gates on event type fields
    const eventFeatureDenied = checkEventTypeFeatures(plan, result.data as Record<string, unknown>);
    if (eventFeatureDenied) return eventFeatureDenied;

    const { questions, memberIds, ...eventTypeData } = result.data;

    // Check slug uniqueness within team
    const existingSlug = await prisma.eventType.findFirst({
      where: {
        teamId: params.id,
        slug: eventTypeData.slug,
      },
    });

    if (existingSlug) {
      return NextResponse.json(
        { error: 'An event type with this slug already exists in this team' },
        { status: 400 }
      );
    }

    // Create event type with questions in a transaction
    const eventType = await prisma.$transaction(async (tx) => {
      // Create the event type
      const created = await tx.eventType.create({
        data: {
          ...eventTypeData,
          userId: session.user.id, // Creator
          teamId: params.id,
          periodStartDate: eventTypeData.periodStartDate
            ? new Date(eventTypeData.periodStartDate)
            : undefined,
          periodEndDate: eventTypeData.periodEndDate
            ? new Date(eventTypeData.periodEndDate)
            : undefined,
          questions: questions?.length
            ? {
                create: questions.map((q, index) => ({
                  ...q,
                  order: index,
                  options: q.options ? q.options : undefined,
                })),
              }
            : undefined,
        },
        include: {
          questions: true,
        },
      });

      // Assign team members if provided
      if (memberIds && memberIds.length > 0) {
        // Verify all members belong to the team
        const validMembers = await tx.teamMember.findMany({
          where: {
            id: { in: memberIds },
            teamId: params.id,
          },
        });

        if (validMembers.length > 0) {
          await tx.eventTypeAssignment.createMany({
            data: validMembers.map((member) => ({
              eventTypeId: created.id,
              teamMemberId: member.id,
            })),
          });
        }
      }

      // Fetch complete event type with assignments
      return tx.eventType.findUnique({
        where: { id: created.id },
        include: {
          questions: {
            orderBy: { order: 'asc' },
          },
          teamMemberAssignments: {
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
          },
        },
      });
    });

    return NextResponse.json({ eventType }, { status: 201 });
  } catch (error) {
    console.error('Error creating team event type:', error);
    return NextResponse.json(
      { error: 'Failed to create team event type' },
      { status: 500 }
    );
  }
}
