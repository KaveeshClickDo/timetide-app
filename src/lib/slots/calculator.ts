/**
 * TimeTide Slot Calculator
 *
 * This module is the heart of the scheduling system. It calculates available
 * time slots considering: base availability, date overrides, calendar busy times,
 * existing bookings, buffer times, minimum notice, and timezone conversions.
 */

import {
  addDays,
  addMinutes,
  startOfDay,
  parseISO,
  format,
  isAfter,
  isBefore,
  areIntervalsOverlapping,
  setHours,
  setMinutes,
  getDay,
} from 'date-fns';
import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';

// ============================================================================
// TYPES
// ============================================================================

export interface TimeSlot {
  start: Date;
  end: Date;
}

export interface AvailabilityWindow {
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
}

export interface DateOverride {
  date: Date;
  isWorking: boolean;
  startTime?: string; // HH:mm
  endTime?: string;   // HH:mm
}

export interface BusyTime {
  start: Date;
  end: Date;
}

export interface SlotCalculatorOptions {
  // Event type settings
  duration: number;         // Slot duration in minutes
  bufferBefore: number;     // Buffer before slot in minutes
  bufferAfter: number;      // Buffer after slot in minutes
  slotInterval?: number;    // Custom interval between slot starts

  // Booking window
  minimumNotice: number;    // Minutes from now before first bookable slot
  maxDaysInAdvance: number; // How far in future slots are available

  // Timezone settings
  hostTimezone: string;     // Host's timezone (availability is defined in this TZ)
  inviteeTimezone: string;  // Invitee's timezone (slots returned in this TZ)

  // Availability
  availability: AvailabilityWindow[];
  dateOverrides: DateOverride[];

  // Busy times (from calendars + existing bookings)
  busyTimes: BusyTime[];

  // Optional constraints
  maxBookingsPerDay?: number;
  existingBookingsPerDay?: Map<string, number>; // YYYY-MM-DD -> count
}

export interface CalculatedSlots {
  [date: string]: TimeSlot[]; // YYYY-MM-DD -> slots
}

// ============================================================================
// MAIN CALCULATOR CLASS
// ============================================================================

export class SlotCalculator {
  private options: Required<SlotCalculatorOptions>;

  constructor(options: SlotCalculatorOptions) {
    this.options = {
      slotInterval: options.slotInterval ?? options.duration,
      maxBookingsPerDay: options.maxBookingsPerDay ?? Infinity,
      existingBookingsPerDay: options.existingBookingsPerDay ?? new Map(),
      ...options,
    } as Required<SlotCalculatorOptions>;
  }

  /**
   * Calculate all available slots within the booking window
   */
  calculate(fromDate?: Date): CalculatedSlots {
    const now = new Date();
    const startDate = fromDate ?? now;
    const endDate = addDays(now, this.options.maxDaysInAdvance);

    const slots: CalculatedSlots = {};
    let currentDate = startOfDay(startDate);

    while (isBefore(currentDate, endDate)) {
      const dateKey = format(currentDate, 'yyyy-MM-dd');
      const daySlots = this.getSlotsForDay(currentDate, now);

      if (daySlots.length > 0) {
        slots[dateKey] = daySlots;
      }

      currentDate = addDays(currentDate, 1);
    }

    return slots;
  }

  /**
   * Get available slots for a specific date
   */
  getSlotsForDay(date: Date, now: Date = new Date()): TimeSlot[] {
    const dateKey = format(date, 'yyyy-MM-dd');
    const dayOfWeek = getDay(date);

    // Check booking limit for the day
    const existingCount = this.options.existingBookingsPerDay.get(dateKey) ?? 0;
    if (existingCount >= this.options.maxBookingsPerDay) {
      return [];
    }

    // Get availability windows for this day
    const windows = this.getAvailabilityWindows(date, dayOfWeek);
    if (windows.length === 0) {
      return [];
    }

    // Generate potential slots from availability windows
    const potentialSlots: TimeSlot[] = [];
    for (const window of windows) {
      const windowSlots = this.generateSlotsFromWindow(date, window);
      potentialSlots.push(...windowSlots);
    }

    // Filter out slots that conflict with busy times or don't meet minimum notice
    const minimumNoticeTime = addMinutes(now, this.options.minimumNotice);
    const availableSlots = potentialSlots.filter((slot) => {
      // Check minimum notice
      if (isBefore(slot.start, minimumNoticeTime)) {
        return false;
      }

      // Check busy time conflicts (including buffers)
      const slotWithBuffers: TimeSlot = {
        start: addMinutes(slot.start, -this.options.bufferBefore),
        end: addMinutes(slot.end, this.options.bufferAfter),
      };

      for (const busy of this.options.busyTimes) {
        if (
          areIntervalsOverlapping(
            { start: slotWithBuffers.start, end: slotWithBuffers.end },
            { start: busy.start, end: busy.end }
          )
        ) {
          return false;
        }
      }

      return true;
    });

    // Convert slots to invitee timezone for display
    return availableSlots.map((slot) => this.convertToInviteeTimezone(slot));
  }

  /**
   * Get availability windows for a specific date, considering overrides
   */
  private getAvailabilityWindows(
    date: Date,
    dayOfWeek: number
  ): { startTime: string; endTime: string }[] {
    // Check for date override first
    const override = this.options.dateOverrides.find(
      (o) => format(o.date, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
    );

    if (override) {
      if (!override.isWorking) {
        return []; // Day off
      }
      if (override.startTime && override.endTime) {
        return [{ startTime: override.startTime, endTime: override.endTime }];
      }
    }

    // Use base availability for this day of week
    const baseWindows = this.options.availability.filter(
      (a) => a.dayOfWeek === dayOfWeek
    );

    return baseWindows.map((w) => ({
      startTime: w.startTime,
      endTime: w.endTime,
    }));
  }

  /**
   * Generate time slots from a single availability window
   */
  private generateSlotsFromWindow(
    date: Date,
    window: { startTime: string; endTime: string }
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];

    // Parse window times in host timezone
    const [startHour, startMin] = window.startTime.split(':').map(Number);
    const [endHour, endMin] = window.endTime.split(':').map(Number);

    // Create start and end times in host timezone
    const hostDate = toZonedTime(date, this.options.hostTimezone);
    let slotStart = setMinutes(setHours(hostDate, startHour), startMin);
    const windowEnd = setMinutes(setHours(hostDate, endHour), endMin);

    // Convert to UTC for consistent comparison
    slotStart = fromZonedTime(slotStart, this.options.hostTimezone);
    const windowEndUtc = fromZonedTime(windowEnd, this.options.hostTimezone);

    const interval = this.options.slotInterval;
    const duration = this.options.duration;

    while (true) {
      const slotEnd = addMinutes(slotStart, duration);

      // Check if slot ends within the window
      if (isAfter(slotEnd, windowEndUtc)) {
        break;
      }

      slots.push({ start: slotStart, end: slotEnd });
      slotStart = addMinutes(slotStart, interval);
    }

    return slots;
  }

  /**
   * Convert a slot from UTC to invitee's timezone for display
   */
  private convertToInviteeTimezone(slot: TimeSlot): TimeSlot {
    return {
      start: toZonedTime(slot.start, this.options.inviteeTimezone),
      end: toZonedTime(slot.end, this.options.inviteeTimezone),
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a specific slot is still available (for double-booking prevention)
 */
export function isSlotAvailable(
  slot: TimeSlot,
  busyTimes: BusyTime[],
  bufferBefore: number = 0,
  bufferAfter: number = 0
): boolean {
  const slotWithBuffers = {
    start: addMinutes(slot.start, -bufferBefore),
    end: addMinutes(slot.end, bufferAfter),
  };

  for (const busy of busyTimes) {
    if (
      areIntervalsOverlapping(
        { start: slotWithBuffers.start, end: slotWithBuffers.end },
        { start: busy.start, end: busy.end }
      )
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Merge overlapping busy times into consolidated blocks
 */
export function mergeBusyTimes(busyTimes: BusyTime[]): BusyTime[] {
  if (busyTimes.length === 0) return [];

  // Sort by start time
  const sorted = [...busyTimes].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );

  const merged: BusyTime[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.start.getTime() <= last.end.getTime()) {
      // Overlapping, extend the last interval
      last.end = new Date(Math.max(last.end.getTime(), current.end.getTime()));
    } else {
      // Non-overlapping, add new interval
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Convert busy times from external calendar format
 */
export function parseBusyTimes(
  events: Array<{ start: string | Date; end: string | Date }>
): BusyTime[] {
  return events.map((e) => ({
    start: typeof e.start === 'string' ? parseISO(e.start) : e.start,
    end: typeof e.end === 'string' ? parseISO(e.end) : e.end,
  }));
}

/**
 * Format a slot for display
 */
export function formatSlotForDisplay(
  slot: TimeSlot,
  timezone: string,
  includeDate: boolean = false
): string {
  const timeFormat = includeDate ? 'EEE, MMM d • h:mm a' : 'h:mm a';
  const startStr = formatInTimeZone(slot.start, timezone, timeFormat);
  const endStr = formatInTimeZone(slot.end, timezone, 'h:mm a');

  return `${startStr} - ${endStr}`;
}

/**
 * Group slots by date for calendar display
 */
export function groupSlotsByDate(slots: TimeSlot[]): Map<string, TimeSlot[]> {
  const grouped = new Map<string, TimeSlot[]>();

  for (const slot of slots) {
    const dateKey = format(slot.start, 'yyyy-MM-dd');
    const existing = grouped.get(dateKey) ?? [];
    existing.push(slot);
    grouped.set(dateKey, existing);
  }

  return grouped;
}

/**
 * Get the next available slot from calculated slots
 */
export function getNextAvailableSlot(
  slots: CalculatedSlots
): TimeSlot | null {
  const dates = Object.keys(slots).sort();

  for (const date of dates) {
    if (slots[date] && slots[date].length > 0) {
      return slots[date][0];
    }
  }

  return null;
}

// ============================================================================
// TEAM SCHEDULING
// ============================================================================

export interface TeamMemberAvailability {
  memberId: string;
  memberName: string;
  slots: CalculatedSlots;
}

/**
 * Calculate round-robin slot assignment
 * Distributes slots among team members in rotation
 */
export function calculateRoundRobinSlots(
  memberAvailabilities: TeamMemberAvailability[],
  lastAssignedMemberId?: string
): Map<string, { slot: TimeSlot; memberId: string; memberName: string }[]> {
  const result = new Map<
    string,
    { slot: TimeSlot; memberId: string; memberName: string }[]
  >();

  // Get all unique dates
  const allDates = new Set<string>();
  for (const member of memberAvailabilities) {
    Object.keys(member.slots).forEach((date) => allDates.add(date));
  }

  // Find starting index for round-robin
  let memberIndex = lastAssignedMemberId
    ? memberAvailabilities.findIndex((m) => m.memberId === lastAssignedMemberId)
    : -1;

  if (memberIndex === -1) memberIndex = memberAvailabilities.length - 1;

  // Process each date
  for (const date of Array.from(allDates).sort()) {
    const dateSlots: { slot: TimeSlot; memberId: string; memberName: string }[] = [];

    // Get all unique slot times across all members for this date
    const slotTimes = new Map<number, TimeSlot>();
    for (const member of memberAvailabilities) {
      const memberSlots = member.slots[date] ?? [];
      for (const slot of memberSlots) {
        slotTimes.set(slot.start.getTime(), slot);
      }
    }

    // Sort slots by time
    const sortedSlots = Array.from(slotTimes.values()).sort(
      (a, b) => a.start.getTime() - b.start.getTime()
    );

    // Assign each slot to the next available member in rotation
    for (const slot of sortedSlots) {
      // Find next available member for this slot
      for (let i = 0; i < memberAvailabilities.length; i++) {
        memberIndex = (memberIndex + 1) % memberAvailabilities.length;
        const member = memberAvailabilities[memberIndex];
        const memberSlots = member.slots[date] ?? [];

        // Check if this member is available at this time
        const isAvailable = memberSlots.some(
          (s) => s.start.getTime() === slot.start.getTime()
        );

        if (isAvailable) {
          dateSlots.push({
            slot,
            memberId: member.memberId,
            memberName: member.memberName,
          });
          break;
        }
      }
    }

    if (dateSlots.length > 0) {
      result.set(date, dateSlots);
    }
  }

  return result;
}

/**
 * Calculate collective availability (all members must be free)
 */
export function calculateCollectiveSlots(
  memberAvailabilities: TeamMemberAvailability[]
): CalculatedSlots {
  if (memberAvailabilities.length === 0) return {};

  const result: CalculatedSlots = {};

  // Get all dates from first member
  const firstMember = memberAvailabilities[0];
  const dates = Object.keys(firstMember.slots);

  for (const date of dates) {
    const firstMemberSlots = firstMember.slots[date] ?? [];

    // Filter to slots where ALL members are available
    const collectiveSlots = firstMemberSlots.filter((slot) => {
      const slotTime = slot.start.getTime();

      return memberAvailabilities.every((member) => {
        const memberSlots = member.slots[date] ?? [];
        return memberSlots.some((s) => s.start.getTime() === slotTime);
      });
    });

    if (collectiveSlots.length > 0) {
      result[date] = collectiveSlots;
    }
  }

  return result;
}
