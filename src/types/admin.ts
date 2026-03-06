// ============================================================================
// ADMIN PANEL TYPES
// ============================================================================

export interface AdminStats {
  totalUsers: number
  newSignupsToday: number
  newSignupsWeek: number
  newSignupsMonth: number
  totalBookings: number
  bookingsToday: number
  activeTeams: number
  openTickets: number
  planDistribution: { plan: string; count: number }[]
  recentSignups: AdminUserListItem[]
  recentBookings: AdminBookingListItem[]
}

export interface AdminUserListItem {
  id: string
  email: string
  name: string | null
  username: string | null
  image: string | null
  plan: string
  role: string
  isDisabled: boolean
  emailVerified: string | null
  createdAt: string
  _count: {
    bookingsAsHost: number
    eventTypes: number
    teamMemberships: number
  }
}

export interface AdminUserDetail extends AdminUserListItem {
  timezone: string
  onboardingCompleted: boolean
  emailVerified: Date | null
  eventTypes: {
    id: string
    title: string
    slug: string
    isActive: boolean
    _count: { bookings: number }
  }[]
  bookingsAsHost: {
    id: string
    startTime: string
    endTime: string
    status: string
    inviteeName: string
    inviteeEmail: string
    eventType: { title: string }
  }[]
  teamMemberships: {
    team: { id: string; name: string; slug: string }
    role: string
  }[]
  calendars: {
    id: string
    provider: string
    name: string
    syncStatus: string
  }[]
}

export interface AdminBookingListItem {
  id: string
  uid: string
  startTime: string
  endTime: string
  status: string
  inviteeName: string
  inviteeEmail: string
  host: { id: string; name: string | null; email: string }
  eventType: { id: string; title: string }
}

export interface AdminTeamListItem {
  id: string
  name: string
  slug: string
  createdAt: string
  _count: { members: number; eventTypes: number }
}

export interface AdminTeamDetail extends AdminTeamListItem {
  description: string | null
  members: {
    id: string
    role: string
    user: { id: string; name: string | null; email: string; image: string | null }
  }[]
  eventTypes: {
    id: string
    title: string
    slug: string
    isActive: boolean
    schedulingType: string | null
  }[]
}

export interface AdminTicketListItem {
  id: string
  subject: string
  status: string
  priority: string
  category: string | null
  createdAt: string
  updatedAt: string
  user: { id: string; name: string | null; email: string }
  assignedAdmin: { id: string; name: string | null } | null
}

export interface AdminTicketDetail extends AdminTicketListItem {
  message: string
  adminNotes: string | null
  messages: {
    id: string
    message: string
    isAdminReply: boolean
    createdAt: string
    sender: { id: string; name: string | null; email: string }
  }[]
}

export interface AdminAuditLogEntry {
  id: string
  action: string
  targetType: string | null
  targetId: string | null
  details: Record<string, unknown> | null
  createdAt: string
  admin: { id: string; name: string | null; email: string }
}

export interface PlatformAnalytics {
  signupTrends: { date: string; count: number }[]
  bookingTrends: { date: string; count: number }[]
  planDistribution: { plan: string; count: number }[]
  topEventTypes: { title: string; bookings: number; host: string }[]
  calendarProviders: { provider: string; count: number }[]
}

export interface SystemHealth {
  webhookHealth: {
    total: number
    success: number
    failed: number
    pending: number
  }
  calendarSyncStatus: { status: string; count: number }[]
  recentFailedDeliveries: {
    id: string
    webhookId: string
    eventType: string
    errorMessage: string | null
    createdAt: string
    webhook: { name: string | null; url: string }
  }[]
}
