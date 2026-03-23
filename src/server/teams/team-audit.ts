import prisma from '@/server/db/prisma';
import { Prisma } from '@/generated/prisma/client';
import type { LogTeamActionParams } from '@/types/team';

export type { LogTeamActionParams } from '@/types/team';

export async function logTeamAction(params: LogTeamActionParams): Promise<void> {
  try {
    await prisma.teamAuditLog.create({
      data: {
        teamId: params.teamId,
        userId: params.userId,
        action: params.action,
        targetType: params.targetType ?? null,
        targetId: params.targetId ?? null,
        changes: params.changes ? (params.changes as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  } catch (error) {
    console.error('Failed to log team action:', error);
  }
}
