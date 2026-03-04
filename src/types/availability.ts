// Centralized availability types

export interface AvailabilitySlot {
  id?: string
  dayOfWeek: number
  startTime: string
  endTime: string
}

export interface Schedule {
  id: string
  name: string
  isDefault: boolean
  slots: AvailabilitySlot[]
}
