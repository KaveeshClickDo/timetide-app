/**
 * /api/teams/[id]/event-types/[eventTypeId]
 * GET: Get single team event type
 * PATCH: Update a team event type
 * DELETE: Delete a team event type
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { checkFeatureAccess, checkEventTypeFeatures } from '@/lib/plan-enforcement';
import type { PlanTier } from '@/lib/pricing';
import {
  locationTypeSchema,
  schedulingTypeSchema,
  periodTypeSchema,
  eventTypeQuestionSchema,
} from '@/lib/validation/schemas';

interface RouteParams {
  params: { id: string; eventTypeId: string };
}

async function checkTeamAccess(teamId: string, userId: string) {
  return prisma.teamMember.findUnique({
    where: {
      teamId_userId: { teamId, userId },
    },
  });
}

// GET /api/teams/[id]/event-types/[eventTypeId]
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await checkTeamAccess(params.id, session.user.id);
    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this team' }, { status: 403 });
    }

    const eventType = await prisma.eventType.findFirst({
      where: {
        id: params.eventTypeId,
        teamId: params.id,
      },
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
          select: { bookings: true },
        },
      },
    });

    if (!eventType) {
      return NextResponse.json({ error: 'Event type not found' }, { status: 404 });
    }

    return NextResponse.json({ eventType });
  } catch (error) {
    console.error('Error fetching team event type:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team event type' },
      { status: 500 }
    );
  }
}

// Validation schema for updating team event type
const updateTeamEventTypeSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional().nullable(),
  length: z.number().int().min(5).max(720).optional(),
  bufferTimeBefore: z.number().int().min(0).max(120).optional(),
  bufferTimeAfter: z.number().int().min(0).max(120).optional(),
  minimumNotice: z.number().int().min(0).max(43200).optional(),
  slotInterval: z.number().int().min(5).max(720).optional().nullable(),
  periodType: periodTypeSchema.optional(),
  periodDays: z.number().int().min(1).max(365).optional().nullable(),
  periodStartDate: z.string().datetime().optional().nullable(),
  periodEndDate: z.string().datetime().optional().nullable(),
  locationType: locationTypeSchema.optional(),
  locationValue: z.string().max(500).optional().nullable(),
  maxBookingsPerDay: z.number().int().min(1).max(100).optional().nullable(),
  seatsPerSlot: z.number().int().min(1).max(100).optional(),
  requiresConfirmation: z.boolean().optional(),
  hideNotes: z.boolean().optional(),
  isActive: z.boolean().optional(),
  schedulingType: schedulingTypeSchema.optional(),
  questions: z.array(eventTypeQuestionSchema).optional(),
  memberIds: z.array(z.string()).optional(),
  meetingOrganizerUserId: z.string().optional().nullable(),
  allowsRecurring: z.boolean().optional(),
  recurringMaxWeeks: z.number().int().min(2).max(24).optional(),
  recurringFrequency: z.string().optional(),
  recurringInterval: z.number().int().min(1).max(90).optional(),
});

// PATCH /api/teams/[id]/event-types/[eventTypeId]
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin/owner
    const membership = await checkTeamAccess(params.id, session.user.id);
    if (!membership || membership.role === 'MEMBER') {
      return NextResponse.json(
        { error: 'Not authorized to update team event types' },
        { status: 403 }
      );
    }

    // Enforce teams feature gate
    const plan = (session.user as any).plan as PlanTier;
    const teamsDenied = checkFeatureAccess(plan, 'teams');
    if (teamsDenied) return teamsDenied;

    // Verify event type belongs to team
    const existing = await prisma.eventType.findFirst({
      where: {
        id: params.eventTypeId,
        teamId: params.id,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Event type not found' }, { status: 404 });
    }

    const body = await request.json();
    const result = updateTeamEventTypeSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: result.error.flatten() },
        { status: 400 }
      );
    }

    // Enforce pro feature gates on event type fields
    const eventFeatureDenied = checkEventTypeFeatures(plan, result.data as Record<string, unknown>);
    if (eventFeatureDenied) return eventFeatureDenied;

    const { questions, memberIds, meetingOrganizerUserId, ...updateFields } = result.data;

    // Check slug uniqueness within team if slug is being changed
    if (updateFields.slug && updateFields.slug !== existing.slug) {
      const existingSlug = await prisma.eventType.findFirst({
        where: {
          teamId: params.id,
          slug: updateFields.slug,
          NOT: { id: params.eventTypeId },
        },
      });

      if (existingSlug) {
        return NextResponse.json(
          { error: 'An event type with this slug already exists in this team' },
          { status: 400 }
        );
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'title', 'slug', 'description', 'length', 'locationType', 'locationValue',
      'isActive', 'requiresConfirmation', 'schedulingType',
      'minimumNotice', 'bufferTimeBefore', 'bufferTimeAfter', 'maxBookingsPerDay',
      'periodType', 'periodDays', 'periodStartDate', 'periodEndDate',
      'seatsPerSlot', 'hideNotes', 'slotInterval', 'successRedirectUrl',
      'allowsRecurring', 'recurringMaxWeeks', 'recurringFrequency', 'recurringInterval',
    ] as const;

    for (const field of allowedFields) {
      if ((updateFields as any)[field] !== undefined) {
        updateData[field] = (updateFields as any)[field];
      }
    }

    // Handle meetingOrganizerUserId separately (not in allowedFields loop)
    if (meetingOrganizerUserId !== undefined) {
      updateData.meetingOrganizerUserId = meetingOrganizerUserId;
    }

    // Convert date strings to Date objects
    if (updateData.periodStartDate && typeof updateData.periodStartDate === 'string') {
      updateData.periodStartDate = new Date(updateData.periodStartDate as string);
    }
    if (updateData.periodEndDate && typeof updateData.periodEndDate === 'string') {
      updateData.periodEndDate = new Date(updateData.periodEndDate as string);
    }

    const eventType = await prisma.$transaction(async (tx) => {
      // Update event type fields
      await tx.eventType.update({
        where: { id: params.eventTypeId },
        data: updateData,
      });

      // Handle questions update if provided
      if (questions !== undefined) {
        await tx.eventTypeQuestion.deleteMany({
          where: { eventTypeId: params.eventTypeId },
        });

        if (questions.length > 0) {
          await tx.eventTypeQuestion.createMany({
            data: questions.map((q, index) => ({
              eventTypeId: params.eventTypeId,
              type: q.type,
              label: q.label,
              required: q.required ?? false,
              placeholder: q.placeholder,
              options: q.options || undefined,
              order: index,
            })),
          });
        }
      }

      // Handle member assignments update if provided
      if (memberIds !== undefined) {
        // Remove all existing assignments
        await tx.eventTypeAssignment.deleteMany({
          where: { eventTypeId: params.eventTypeId },
        });

        // Assign new members
        if (memberIds.length > 0) {
          const validMembers = await tx.teamMember.findMany({
            where: {
              id: { in: memberIds },
              teamId: params.id,
            },
          });

          if (validMembers.length > 0) {
            await tx.eventTypeAssignment.createMany({
              data: validMembers.map((member) => ({
                eventTypeId: params.eventTypeId,
                teamMemberId: member.id,
              })),
            });
          }
        }
      }

      // Fetch complete updated event type
      return tx.eventType.findUnique({
        where: { id: params.eventTypeId },
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

    return NextResponse.json({ eventType });
  } catch (error) {
    console.error('Error updating team event type:', error);
    return NextResponse.json(
      { error: 'Failed to update team event type' },
      { status: 500 }
    );
  }
}

// DELETE /api/teams/[id]/event-types/[eventTypeId]
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin/owner
    const membership = await checkTeamAccess(params.id, session.user.id);
    if (!membership || membership.role === 'MEMBER') {
      return NextResponse.json(
        { error: 'Not authorized to delete team event types' },
        { status: 403 }
      );
    }

    // Verify event type belongs to team
    const existing = await prisma.eventType.findFirst({
      where: {
        id: params.eventTypeId,
        teamId: params.id,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Event type not found' }, { status: 404 });
    }

    // Delete associated records first
    await prisma.eventTypeQuestion.deleteMany({
      where: { eventTypeId: params.eventTypeId },
    });

    await prisma.eventTypeAssignment.deleteMany({
      where: { eventTypeId: params.eventTypeId },
    });

    // Delete the event type
    await prisma.eventType.delete({
      where: { id: params.eventTypeId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting team event type:', error);
    return NextResponse.json(
      { error: 'Failed to delete team event type' },
      { status: 500 }
    );
  }
}
