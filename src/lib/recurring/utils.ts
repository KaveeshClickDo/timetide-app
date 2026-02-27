/**
 * Recurring booking utilities
 * Generates occurrence dates for recurring bookings with various frequencies
 */

import { addDays, addMonths } from 'date-fns'

// ============================================================================
// TYPES
// ============================================================================

export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly' | 'custom'

export interface RecurringConfig {
  frequency: RecurringFrequency
  count: number
  interval?: number // days, for 'custom' frequency
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum number of occurrences allowed for a recurring booking series */
export const MAX_RECURRING_OCCURRENCES = 24

/** Minimum number of occurrences */
export const MIN_RECURRING_OCCURRENCES = 2

/** Backward-compat aliases */
export const MAX_RECURRING_WEEKS = MAX_RECURRING_OCCURRENCES
export const MIN_RECURRING_WEEKS = MIN_RECURRING_OCCURRENCES

/** Human-readable labels for each frequency */
export const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  monthly: 'Every month',
  custom: 'Custom interval',
}

// ============================================================================
// DATE GENERATION
// ============================================================================

/**
 * Generate an array of dates for a recurring series.
 *
 * Overloaded:
 * - (startDate, weeks)  — backward compat: weekly, clamped to 2-24
 * - (startDate, config)  — full config with frequency
 *
 * @returns Array of Date objects, one per occurrence
 */
export function generateRecurringDates(startDate: Date, configOrWeeks: RecurringConfig | number): Date[] {
  // Backward compatibility: plain number = weekly
  const config: RecurringConfig = typeof configOrWeeks === 'number'
    ? { frequency: 'weekly', count: configOrWeeks }
    : configOrWeeks

  const count = Math.min(MAX_RECURRING_OCCURRENCES, Math.max(MIN_RECURRING_OCCURRENCES, config.count))
  const dates: Date[] = []

  for (let i = 0; i < count; i++) {
    if (i === 0) {
      dates.push(startDate)
      continue
    }

    switch (config.frequency) {
      case 'weekly':
        dates.push(addDays(startDate, i * 7))
        break
      case 'biweekly':
        dates.push(addDays(startDate, i * 14))
        break
      case 'monthly':
        dates.push(addMonths(startDate, i))
        break
      case 'custom':
        dates.push(addDays(startDate, i * (config.interval || 7)))
        break
      default:
        // Fallback: weekly
        dates.push(addDays(startDate, i * 7))
    }
  }

  return dates
}
