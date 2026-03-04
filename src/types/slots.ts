// Centralized slot calculation types

// ============================================================================
// BASE SLOT TYPES
// ============================================================================

export interface SlotTimeSlot {
  start: Date
  end: Date
}

export interface AvailabilityWindow {
  dayOfWeek: number
  startTime: string
  endTime: string
}

export interface DateOverride {
  date: Date
  isWorking: boolean
  startTime?: string
  endTime?: string
}

export interface BusyTime {
  start: Date
  end: Date
}

export interface SlotCalculatorOptions {
  duration: number
  bufferBefore: number
  bufferAfter: number
  slotInterval?: number
  minimumNotice: number
  maxDaysInAdvance: number
  hostTimezone: string
  inviteeTimezone: string
  availability: AvailabilityWindow[]
  dateOverrides: DateOverride[]
  busyTimes: BusyTime[]
  maxBookingsPerDay?: number
  existingBookingsPerDay?: Map<string, number>
}

export interface CalculatedSlots {
  [date: string]: SlotTimeSlot[]
}

export interface TeamMemberAvailability {
  memberId: string
  memberName: string
  slots: CalculatedSlots
}

// ============================================================================
// TEAM SLOT TYPES
// ============================================================================

export interface TeamMemberInfo {
  id: string
  userId: string
  userName: string
  userImage: string | null
  timezone: string
  priority: number
  isActive: boolean
}

export interface TeamSlotWithAssignment {
  start: Date
  end: Date
  assignedMemberId?: string
  assignedMemberName?: string
  availableMembers?: TeamMemberInfo[]
}

export interface TeamCalculatedSlots {
  [date: string]: TeamSlotWithAssignment[]
}

export interface TeamSlotCalculatorResult {
  slots: TeamCalculatedSlots
  schedulingType: 'ROUND_ROBIN' | 'COLLECTIVE' | 'MANAGED'
  members: TeamMemberInfo[]
  lastAssignedMemberId?: string
}
