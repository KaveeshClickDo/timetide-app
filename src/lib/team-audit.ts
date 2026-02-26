import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';

export interface LogTeamActionParams {
  teamId: string;
  userId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  changes?: Record<string, unknown>;
}

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
