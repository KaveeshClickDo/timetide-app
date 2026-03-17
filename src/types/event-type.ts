// Centralized event type related types

import type { LocationType, SchedulingType } from './booking'

export interface Question {
  id: string
  type: string
  label: string
  required: boolean
  placeholder?: string | null
  options?: string[] | null
}

/** Question without id, used when creating new questions */
export interface QuestionInput {
  type: string
  label: string
  required: boolean
  placeholder?: string
  options?: string[]
}

/** Event type as shown in the dashboard list */
export interface EventTypeListItem {
  id: string
  title: string
  slug: string
  description: string | null
  length: number
  locationType: string
  isActive: boolean
  lockedByDowngrade: boolean
  _count: {
    bookings: number
  }
}

/** Event type with full details for booking pages */
export interface EventTypeDetail {
  id: string
  title: string
  slug?: string
  description: string | null
  length: number
  locationType: string
  seatsPerSlot?: number
  allowsRecurring?: boolean
  recurringMaxWeeks?: number
  recurringFrequency?: string
  recurringInterval?: number
  requiresConfirmation?: boolean
  schedulingType?: SchedulingType | null
  questions?: Question[]
}

/** Minimal event type for public profile pages */
export interface EventTypeSummary {
  id: string
  title: string
  slug: string
  description: string | null
  length: number
  locationType: string
}

/** Onboarding event type (minimal) */
export interface EventTypeOnboarding {
  id: string
  title: string
  slug: string
  length: number
  isActive: boolean
}

/** Team event type with assignments */
export interface TeamEventType {
  id: string
  title: string
  slug: string
  description: string | null
  length: number
  locationType: string
  schedulingType: SchedulingType | null
  isActive: boolean
  teamMemberAssignments: EventTypeAssignment[]
  _count: {
    bookings: number
  }
}

export interface EventTypeAssignment {
  id: string
  teamMember: {
    id: string
    user: {
      id: string
      name: string | null
      email: string
      image: string | null
    }
  }
}
