/**
 * Team audit log listing with cursor-based pagination
 * and user name resolution.
 */

import prisma from '@/server/db/prisma'
import { checkTeamAccess } from '@/server/teams/team-access'
import { DEFAULT_PAGE_SIZE, MAX_LIST_LIMIT } from '@/server/api-constants'

// ── Domain errors ─────────────────────────────────────────────────────────────

export class AuditLogNotAuthorizedError extends Error {
  constructor() {
    super('Not authorized')
    this.name = 'AuditLogNotAuthorizedError'
  }
}

// ── List audit logs ───────────────────────────────────────────────────────────

export interface ListAuditLogParams {
  teamId: string
  sessionUserId: string
  cursor?: string | null
  limit?: number
}

export async function listTeamAuditLog(params: ListAuditLogParams) {
  const { teamId, sessionUserId, cursor } = params

  const membership = await checkTeamAccess(teamId, sessionUserId, 'ADMIN')
  if (!membership) throw new AuditLogNotAuthorizedError()

  const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_LIST_LIMIT)

  const logs = await prisma.teamAuditLog.findMany({
    where: { teamId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  })

  // Resolve user names
  const userIds = Array.from(new Set(logs.map((log) => log.userId)))
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, image: true },
  })
  const userMap = new Map(users.map((u) => [u.id, u]))

  const hasMore = logs.length > limit
  const items = hasMore ? logs.slice(0, limit) : logs

  return {
    logs: items.map((log) => ({
      ...log,
      user: userMap.get(log.userId) || { id: log.userId, name: 'Unknown', email: '', image: null },
    })),
    nextCursor: hasMore ? items[items.length - 1].id : null,
  }
}
