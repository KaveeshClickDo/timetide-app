// Centralized recurring booking types

export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly' | 'custom'

export interface RecurringConfig {
  frequency: RecurringFrequency
  count: number
  interval?: number
}
