// Centralized notification types

export type NotificationType =
  | 'BOOKING_CREATED'
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_REJECTED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_RESCHEDULED'
  | 'BOOKING_REMINDER'
  | 'TEAM_MEMBER_ADDED'
  | 'TEAM_INVITATION_RECEIVED'

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  message: string
  read: boolean
  bookingId: string | null
  createdAt: string
}

export interface NotificationsResponse {
  notifications: Notification[]
  unreadCount: number
  nextCursor: string | null
}

export interface CreateNotificationParams {
  userId: string
  type: NotificationType
  title: string
  message: string
  bookingId?: string
}
