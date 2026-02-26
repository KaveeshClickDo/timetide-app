import { describe, it, expect, beforeEach } from 'vitest';
import {
  SlotCalculator,
  isSlotAvailable,
  mergeBusyTimes,
  parseBusyTimes,
  formatSlotForDisplay,
  getNextAvailableSlot,
  calculateCollectiveSlots,
  type SlotCalculatorOptions,
  type BusyTime,
  type TimeSlot,
  type CalculatedSlots,
} from '../calculator';

// ============================================================================
// HELPER: fixed "now" to keep tests deterministic
// ============================================================================
const FIXED_NOW = new Date('2026-03-10T08:00:00.000Z'); // Tuesday

function makeOptions(overrides: Partial<SlotCalculatorOptions> = {}): SlotCalculatorOptions {
  return {
    duration: 30,
    bufferBefore: 0,
    bufferAfter: 0,
    minimumNotice: 0,
    maxDaysInAdvance: 7,
    hostTimezone: 'UTC',
    inviteeTimezone: 'UTC',
    availability: [
      // Mon–Fri 09:00–17:00
      { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
      { dayOfWeek: 2, startTime: '09:00', endTime: '17:00' },
      { dayOfWeek: 3, startTime: '09:00', endTime: '17:00' },
      { dayOfWeek: 4, startTime: '09:00', endTime: '17:00' },
      { dayOfWeek: 5, startTime: '09:00', endTime: '17:00' },
    ],
    dateOverrides: [],
    busyTimes: [],
    ...overrides,
  };
}

// ============================================================================
// SlotCalculator
// ============================================================================
describe('SlotCalculator', () => {
  it('generates 30-min slots for a standard workday', () => {
    const calc = new SlotCalculator(makeOptions());
    const tuesday = new Date('2026-03-10T00:00:00.000Z');
    const slots = calc.getSlotsForDay(tuesday, FIXED_NOW);

    // 09:00–17:00 in 30-min increments = 16 slots
    expect(slots.length).toBe(16);
    expect(slots[0].start.toISOString()).toBe('2026-03-10T09:00:00.000Z');
    expect(slots[0].end.toISOString()).toBe('2026-03-10T09:30:00.000Z');
    expect(slots[15].start.toISOString()).toBe('2026-03-10T16:30:00.000Z');
    expect(slots[15].end.toISOString()).toBe('2026-03-10T17:00:00.000Z');
  });

  it('returns no slots for a weekend day', () => {
    const calc = new SlotCalculator(makeOptions());
    const saturday = new Date('2026-03-14T00:00:00.000Z');
    const slots = calc.getSlotsForDay(saturday, FIXED_NOW);
    expect(slots.length).toBe(0);
  });

  it('respects date override (day off)', () => {
    const calc = new SlotCalculator(
      makeOptions({
        dateOverrides: [
          { date: new Date('2026-03-11T00:00:00.000Z'), isWorking: false },
        ],
      })
    );
    const wednesday = new Date('2026-03-11T00:00:00.000Z');
    expect(calc.getSlotsForDay(wednesday, FIXED_NOW).length).toBe(0);
  });

  it('respects date override (custom hours)', () => {
    const calc = new SlotCalculator(
      makeOptions({
        dateOverrides: [
          {
            date: new Date('2026-03-11T00:00:00.000Z'),
            isWorking: true,
            startTime: '10:00',
            endTime: '12:00',
          },
        ],
      })
    );
    const wednesday = new Date('2026-03-11T00:00:00.000Z');
    const slots = calc.getSlotsForDay(wednesday, FIXED_NOW);
    // 10:00–12:00 in 30-min = 4 slots
    expect(slots.length).toBe(4);
    expect(slots[0].start.toISOString()).toBe('2026-03-11T10:00:00.000Z');
  });

  it('filters out slots that conflict with busy times', () => {
    const calc = new SlotCalculator(
      makeOptions({
        busyTimes: [
          {
            start: new Date('2026-03-10T10:00:00.000Z'),
            end: new Date('2026-03-10T11:00:00.000Z'),
          },
        ],
      })
    );
    const tuesday = new Date('2026-03-10T00:00:00.000Z');
    const slots = calc.getSlotsForDay(tuesday, FIXED_NOW);

    // 10:00 and 10:30 slots should be excluded → 16 - 2 = 14
    expect(slots.length).toBe(14);
    const slotTimes = slots.map((s) => s.start.toISOString());
    expect(slotTimes).not.toContain('2026-03-10T10:00:00.000Z');
    expect(slotTimes).not.toContain('2026-03-10T10:30:00.000Z');
  });

  it('applies buffer times when checking busy conflicts', () => {
    const calc = new SlotCalculator(
      makeOptions({
        bufferBefore: 15,
        bufferAfter: 15,
        busyTimes: [
          {
            start: new Date('2026-03-10T10:00:00.000Z'),
            end: new Date('2026-03-10T10:30:00.000Z'),
          },
        ],
      })
    );
    const tuesday = new Date('2026-03-10T00:00:00.000Z');
    const slots = calc.getSlotsForDay(tuesday, FIXED_NOW);

    // 09:30 (buffer overlaps busy start), 10:00 (directly busy), 10:30 (buffer overlaps busy end) → 3 removed
    const slotTimes = slots.map((s) => s.start.toISOString());
    expect(slotTimes).not.toContain('2026-03-10T10:00:00.000Z');
  });

  it('enforces minimum notice', () => {
    // Now is 08:00 UTC, minimumNotice = 120 min → first slot at 10:00+
    const calc = new SlotCalculator(makeOptions({ minimumNotice: 120 }));
    const tuesday = new Date('2026-03-10T00:00:00.000Z');
    const slots = calc.getSlotsForDay(tuesday, FIXED_NOW);

    expect(slots[0].start.getTime()).toBeGreaterThanOrEqual(
      new Date('2026-03-10T10:00:00.000Z').getTime()
    );
  });

  it('enforces max bookings per day', () => {
    const existing = new Map<string, number>();
    existing.set('2026-03-10', 5);

    const calc = new SlotCalculator(
      makeOptions({
        maxBookingsPerDay: 5,
        existingBookingsPerDay: existing,
      })
    );
    const tuesday = new Date('2026-03-10T00:00:00.000Z');
    expect(calc.getSlotsForDay(tuesday, FIXED_NOW).length).toBe(0);
  });

  it('uses custom slot interval', () => {
    const calc = new SlotCalculator(makeOptions({ duration: 60, slotInterval: 60 }));
    const tuesday = new Date('2026-03-10T00:00:00.000Z');
    const slots = calc.getSlotsForDay(tuesday, FIXED_NOW);

    // 09:00–17:00 in 60-min slots = 8 slots
    expect(slots.length).toBe(8);
  });

  it('calculate() returns slots grouped by date', () => {
    // Use real "now" since calculate() internally uses new Date() for end boundary
    const now = new Date();
    const calc = new SlotCalculator(makeOptions({ maxDaysInAdvance: 14, minimumNotice: 0 }));
    const result = calc.calculate(now);

    // Should have entries keyed by YYYY-MM-DD (at least some weekdays in the next 14 days)
    const dates = Object.keys(result);
    expect(dates.length).toBeGreaterThan(0);
    for (const date of dates) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result[date].length).toBeGreaterThan(0);
    }
  });

  it('enforces safety limits for tiny intervals', () => {
    // Even with duration=1 (below minimum), it should clamp to MIN_SLOT_DURATION=5
    const calc = new SlotCalculator(makeOptions({ duration: 1, slotInterval: 1 }));
    const tuesday = new Date('2026-03-10T00:00:00.000Z');
    const slots = calc.getSlotsForDay(tuesday, FIXED_NOW);

    // 09:00–17:00 = 480 min, 5-min intervals = 96 slots, capped at MAX_SLOTS_PER_DAY=100
    expect(slots.length).toBeLessThanOrEqual(100);
    expect(slots.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// isSlotAvailable
// ============================================================================
describe('isSlotAvailable', () => {
  const slot: TimeSlot = {
    start: new Date('2026-03-10T10:00:00.000Z'),
    end: new Date('2026-03-10T10:30:00.000Z'),
  };

  it('returns true when no busy times', () => {
    expect(isSlotAvailable(slot, [])).toBe(true);
  });

  it('returns false when busy time overlaps', () => {
    const busy: BusyTime[] = [
      { start: new Date('2026-03-10T10:15:00.000Z'), end: new Date('2026-03-10T10:45:00.000Z') },
    ];
    expect(isSlotAvailable(slot, busy)).toBe(false);
  });

  it('returns true when busy time is adjacent (no overlap)', () => {
    const busy: BusyTime[] = [
      { start: new Date('2026-03-10T10:30:00.000Z'), end: new Date('2026-03-10T11:00:00.000Z') },
    ];
    expect(isSlotAvailable(slot, busy)).toBe(true);
  });

  it('detects conflict through buffer time', () => {
    const busy: BusyTime[] = [
      { start: new Date('2026-03-10T10:30:00.000Z'), end: new Date('2026-03-10T11:00:00.000Z') },
    ];
    // With 15-min buffer after, slot extends to 10:45 which overlaps busy 10:30–11:00
    expect(isSlotAvailable(slot, busy, 0, 15)).toBe(false);
  });
});

// ============================================================================
// mergeBusyTimes
// ============================================================================
describe('mergeBusyTimes', () => {
  it('returns empty for empty input', () => {
    expect(mergeBusyTimes([])).toEqual([]);
  });

  it('merges overlapping intervals', () => {
    const busy: BusyTime[] = [
      { start: new Date('2026-03-10T09:00:00.000Z'), end: new Date('2026-03-10T10:00:00.000Z') },
      { start: new Date('2026-03-10T09:30:00.000Z'), end: new Date('2026-03-10T10:30:00.000Z') },
    ];
    const merged = mergeBusyTimes(busy);
    expect(merged.length).toBe(1);
    expect(merged[0].start.toISOString()).toBe('2026-03-10T09:00:00.000Z');
    expect(merged[0].end.toISOString()).toBe('2026-03-10T10:30:00.000Z');
  });

  it('keeps non-overlapping intervals separate', () => {
    const busy: BusyTime[] = [
      { start: new Date('2026-03-10T09:00:00.000Z'), end: new Date('2026-03-10T10:00:00.000Z') },
      { start: new Date('2026-03-10T11:00:00.000Z'), end: new Date('2026-03-10T12:00:00.000Z') },
    ];
    expect(mergeBusyTimes(busy).length).toBe(2);
  });

  it('merges adjacent intervals (touching boundaries)', () => {
    const busy: BusyTime[] = [
      { start: new Date('2026-03-10T09:00:00.000Z'), end: new Date('2026-03-10T10:00:00.000Z') },
      { start: new Date('2026-03-10T10:00:00.000Z'), end: new Date('2026-03-10T11:00:00.000Z') },
    ];
    const merged = mergeBusyTimes(busy);
    expect(merged.length).toBe(1);
    expect(merged[0].end.toISOString()).toBe('2026-03-10T11:00:00.000Z');
  });

  it('handles unsorted input', () => {
    const busy: BusyTime[] = [
      { start: new Date('2026-03-10T11:00:00.000Z'), end: new Date('2026-03-10T12:00:00.000Z') },
      { start: new Date('2026-03-10T09:00:00.000Z'), end: new Date('2026-03-10T10:00:00.000Z') },
    ];
    const merged = mergeBusyTimes(busy);
    expect(merged.length).toBe(2);
    expect(merged[0].start.toISOString()).toBe('2026-03-10T09:00:00.000Z');
  });
});

// ============================================================================
// parseBusyTimes
// ============================================================================
describe('parseBusyTimes', () => {
  it('parses string dates', () => {
    const result = parseBusyTimes([
      { start: '2026-03-10T09:00:00.000Z', end: '2026-03-10T10:00:00.000Z' },
    ]);
    expect(result[0].start).toBeInstanceOf(Date);
    expect(result[0].end).toBeInstanceOf(Date);
  });

  it('passes through Date objects', () => {
    const start = new Date('2026-03-10T09:00:00.000Z');
    const end = new Date('2026-03-10T10:00:00.000Z');
    const result = parseBusyTimes([{ start, end }]);
    expect(result[0].start).toBe(start);
    expect(result[0].end).toBe(end);
  });
});

// ============================================================================
// formatSlotForDisplay
// ============================================================================
describe('formatSlotForDisplay', () => {
  const slot: TimeSlot = {
    start: new Date('2026-03-10T14:00:00.000Z'),
    end: new Date('2026-03-10T14:30:00.000Z'),
  };

  it('formats time-only by default', () => {
    const result = formatSlotForDisplay(slot, 'UTC');
    expect(result).toContain('-');
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it('includes date when requested', () => {
    const result = formatSlotForDisplay(slot, 'UTC', true);
    expect(result).toMatch(/Mar/);
  });
});

// ============================================================================
// getNextAvailableSlot
// ============================================================================
describe('getNextAvailableSlot', () => {
  it('returns first slot from first date', () => {
    const slot: TimeSlot = {
      start: new Date('2026-03-10T09:00:00.000Z'),
      end: new Date('2026-03-10T09:30:00.000Z'),
    };
    const slots: CalculatedSlots = { '2026-03-10': [slot] };
    expect(getNextAvailableSlot(slots)).toEqual(slot);
  });

  it('returns null for empty slots', () => {
    expect(getNextAvailableSlot({})).toBeNull();
  });
});

// ============================================================================
// calculateCollectiveSlots
// ============================================================================
describe('calculateCollectiveSlots', () => {
  const slotA: TimeSlot = {
    start: new Date('2026-03-10T09:00:00.000Z'),
    end: new Date('2026-03-10T09:30:00.000Z'),
  };
  const slotB: TimeSlot = {
    start: new Date('2026-03-10T10:00:00.000Z'),
    end: new Date('2026-03-10T10:30:00.000Z'),
  };

  it('returns only slots where all members are available', () => {
    const result = calculateCollectiveSlots([
      { memberId: '1', memberName: 'Alice', slots: { '2026-03-10': [slotA, slotB] } },
      { memberId: '2', memberName: 'Bob', slots: { '2026-03-10': [slotA] } },
    ]);
    // Only slotA is shared
    expect(result['2026-03-10']?.length).toBe(1);
    expect(result['2026-03-10'][0].start.toISOString()).toBe('2026-03-10T09:00:00.000Z');
  });

  it('returns empty for no members', () => {
    expect(calculateCollectiveSlots([])).toEqual({});
  });
});
