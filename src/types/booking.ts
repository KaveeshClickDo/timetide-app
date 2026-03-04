// Centralized booking-related types

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'REJECTED' | 'COMPLETED' | 'SKIPPED'

export type BookingStep = 'calendar' | 'time' | 'details' | 'confirmation'

export interface BookingWindow {
  type: 'ROLLING' | 'RANGE' | 'UNLIMITED'
  start: string
  end: string | null
}

export interface TimeSlot {
  time: string
  start: Date
  end: Date
  formattedTime: string
  seatsRemaining?: number
  assignedMemberId?: string
}

export interface RecurringBookingRef {
  id: string
  uid: string
  startTime: string
  endTime: string
  status: string
  recurringIndex: number | null
}

export interface BookingDetails {
  id: string
  uid: string
  startTime: string
  endTime: string
  timezone: string
  status: BookingStatus
  inviteeName: string
  inviteeEmail: string
  inviteePhone?: string
  inviteeNotes?: string
  location?: string
  meetingUrl?: string
  responses?: Record<string, any>
  cancellationReason?: string
  cancelledAt?: string
  createdAt: string
  recurringGroupId?: string
  recurringIndex?: number
  recurringCount?: number
  recurringBookings?: RecurringBookingRef[]
  assignedUserId?: string
  assignedUser?: {
    id: string
    name: string | null
    email: string
    image: string | null
  }
  eventType: {
    id: string
    title: string
    description?: string
    length: number
    locationType: string
    locationValue?: string
    schedulingType?: SchedulingType
    teamId?: string
    questions?: Array<{
      id?: string
      type: string
      label: string
      required: boolean
      placeholder?: string | null
      options?: string[] | null
    }>
  }
  host: {
    id?: string
    name: string
    email?: string
    image?: string
    timezone?: string
  }
}

/** Booking list item (dashboard) */
export interface BookingListItem {
  id: string
  uid: string
  startTime: string
  endTime: string
  timezone: string
  status: BookingStatus
  meetingUrl?: string
  location?: string
  inviteeName: string
  inviteeEmail: string
  recurringGroupId?: string | null
  recurringIndex?: number | null
  recurringCount?: number | null
  eventType: {
    id: string
    title: string
    length: number
    locationType: string
    schedulingType?: string | null
    team?: {
      id: string
      name: string
    } | null
  }
}

/** Series booking within a recurring group */
export interface SeriesBooking {
  id: string
  uid: string
  startTime: string
  endTime: string
  status: string
  recurringIndex: number | null
  recurringCount: number | null
  timezone: string
}

export interface SeriesData {
  groupId: string
  bookings: SeriesBooking[]
  eventType: {
    title: string
    slug: string
    length: number
    locationType: string
    description: string | null
  }
  inviteeName: string
  inviteeEmail: string
  totalOccurrences: number
  recurringFrequency?: string
  recurringInterval?: number
}

// Re-export scheduling type from shared location
export type SchedulingType = 'ROUND_ROBIN' | 'COLLECTIVE' | 'MANAGED'

export type LocationType = 'GOOGLE_MEET' | 'ZOOM' | 'TEAMS' | 'PHONE' | 'IN_PERSON' | 'CUSTOM'
