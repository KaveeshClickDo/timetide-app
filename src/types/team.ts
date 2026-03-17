// Centralized team-related types

export type TeamRole = 'OWNER' | 'ADMIN' | 'MEMBER'

/** Team member as shown on public pages (minimal) */
export interface TeamMemberPublic {
  id: string
  name: string | null
  image: string | null
}

/** Team member with scheduling info (booking widgets) */
export interface TeamMemberBooking {
  id: string
  name: string | null
  image: string | null
  timezone: string
  priority: number
}

/** Team member with role (dashboard lists) */
export interface TeamMemberWithRole {
  id: string
  role: TeamRole
  isActive?: boolean
  user: {
    id: string
    name: string | null
    email: string
    image: string | null
  }
}

/** Extended team member (dashboard detail with assignments count) */
export interface TeamMemberDetail extends TeamMemberWithRole {
  priority: number
  _count?: {
    assignments: number
  }
}

/** Team member for booking detail page (flat structure from API) */
export interface TeamMemberFlat {
  id: string
  userId: string
  name: string | null
  email: string
  image: string | null
  timezone: string
  priority: number
  isAvailable?: boolean
}

/** Team invitation */
export interface TeamInvitation {
  id: string
  email: string
  role: TeamRole
  status: string
  expiresAt: string
  createdAt: string
  inviter: { id: string; name: string | null; email: string } | null
}

/** Audit log entry */
export interface AuditLogEntry {
  id: string
  action: string
  targetType: string | null
  targetId: string | null
  changes: Record<string, unknown> | null
  createdAt: string
  user: {
    id: string
    name: string | null
    email: string
    image: string | null
  }
}

/** Team as shown in dashboard list */
export interface TeamListItem {
  id: string
  name: string
  slug: string
  description: string | null
  logo: string | null
  members: TeamMemberWithRole[]
  _count: {
    eventTypes: number
  }
}

/** Team detail for team management page */
export interface TeamDetail {
  id: string
  name: string
  slug: string
  description: string | null
  logo: string | null
  members: TeamMemberDetail[]
  _count: {
    eventTypes: number
  }
  ownerPlanActive?: boolean
}

/** Team for public-facing pages */
export interface TeamPublic {
  id: string
  name: string
  slug: string
  description: string | null
  logo: string | null
  memberCount?: number
  members?: TeamMemberPublic[]
}

/** Parameters for logging team audit actions */
export interface LogTeamActionParams {
  teamId: string
  userId: string
  action: string
  targetType?: string
  targetId?: string
  changes?: Record<string, unknown>
}
