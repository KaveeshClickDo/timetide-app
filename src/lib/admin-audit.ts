import prisma from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'

export interface LogAdminActionParams {
  adminId: string
  action: string
  targetType?: string
  targetId?: string
  details?: Record<string, unknown>
}

export async function logAdminAction(params: LogAdminActionParams): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminId: params.adminId,
        action: params.action,
        targetType: params.targetType ?? null,
        targetId: params.targetId ?? null,
        details: params.details ? (params.details as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    })
  } catch (error) {
    console.error('Failed to log admin action:', error)
  }
}
