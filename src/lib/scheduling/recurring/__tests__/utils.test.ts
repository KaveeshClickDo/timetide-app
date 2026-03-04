import { describe, it, expect } from 'vitest';
import {
  generateRecurringDates,
  MAX_RECURRING_WEEKS,
  MIN_RECURRING_WEEKS,
  MAX_RECURRING_OCCURRENCES,
  MIN_RECURRING_OCCURRENCES,
  FREQUENCY_LABELS,
} from '../utils';

describe('generateRecurringDates', () => {
  // ── Backward-compat: number argument = weekly ──
  it('generates weekly dates when given a plain number', () => {
    const start = new Date('2026-03-10T10:00:00Z');
    const dates = generateRecurringDates(start, 4);
    expect(dates).toHaveLength(4);
    expect(dates[0].toISOString()).toBe('2026-03-10T10:00:00.000Z');
    expect(dates[1].toISOString()).toBe('2026-03-17T10:00:00.000Z');
    expect(dates[2].toISOString()).toBe('2026-03-24T10:00:00.000Z');
    expect(dates[3].toISOString()).toBe('2026-03-31T10:00:00.000Z');
  });

  it('first date matches the start date', () => {
    const start = new Date('2026-06-01T14:30:00Z');
    const dates = generateRecurringDates(start, 5);
    expect(dates[0].getTime()).toBe(start.getTime());
  });

  it('clamps to minimum of 2', () => {
    const start = new Date('2026-03-10T10:00:00Z');
    const dates = generateRecurringDates(start, 1);
    expect(dates).toHaveLength(2);
  });

  it('clamps to maximum of 24', () => {
    const start = new Date('2026-03-10T10:00:00Z');
    const dates = generateRecurringDates(start, 30);
    expect(dates).toHaveLength(24);
  });

  it('preserves time of day across all weekly occurrences', () => {
    const start = new Date('2026-03-10T14:30:00Z');
    const dates = generateRecurringDates(start, 6);
    for (const d of dates) {
      expect(d.getUTCHours()).toBe(14);
      expect(d.getUTCMinutes()).toBe(30);
    }
  });

  // ── Weekly with config object ──
  it('weekly config produces 7-day intervals', () => {
    const start = new Date('2026-03-10T10:00:00Z');
    const dates = generateRecurringDates(start, { frequency: 'weekly', count: 4 });
    expect(dates).toHaveLength(4);
    const diffMs = dates[1].getTime() - dates[0].getTime();
    expect(diffMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  // ── Biweekly ──
  it('biweekly produces 14-day intervals', () => {
    const start = new Date('2026-03-10T10:00:00Z');
    const dates = generateRecurringDates(start, { frequency: 'biweekly', count: 4 });
    expect(dates).toHaveLength(4);
    expect(dates[0].toISOString()).toBe('2026-03-10T10:00:00.000Z');
    expect(dates[1].toISOString()).toBe('2026-03-24T10:00:00.000Z');
    expect(dates[2].toISOString()).toBe('2026-04-07T10:00:00.000Z');
    expect(dates[3].toISOString()).toBe('2026-04-21T10:00:00.000Z');
  });

  // ── Monthly ──
  it('monthly produces month intervals', () => {
    const start = new Date('2026-01-15T10:00:00Z');
    const dates = generateRecurringDates(start, { frequency: 'monthly', count: 4 });
    expect(dates).toHaveLength(4);
    expect(dates[0].toISOString()).toBe('2026-01-15T10:00:00.000Z');
    expect(dates[1].toISOString()).toBe('2026-02-15T10:00:00.000Z');
    expect(dates[2].toISOString()).toBe('2026-03-15T10:00:00.000Z');
    expect(dates[3].toISOString()).toBe('2026-04-15T10:00:00.000Z');
  });

  it('monthly handles month-end correctly (Jan 31 → Feb 28)', () => {
    const start = new Date('2026-01-31T10:00:00Z');
    const dates = generateRecurringDates(start, { frequency: 'monthly', count: 3 });
    expect(dates).toHaveLength(3);
    expect(dates[0].toISOString()).toBe('2026-01-31T10:00:00.000Z');
    // Feb 28 (2026 is not a leap year)
    expect(dates[1].getUTCDate()).toBe(28);
    expect(dates[1].getUTCMonth()).toBe(1); // February
    // March 28 (date-fns clamps to 28)
    expect(dates[2].getUTCMonth()).toBe(2); // March
  });

  // ── Custom interval ──
  it('custom interval produces correct day spacing', () => {
    const start = new Date('2026-03-01T10:00:00Z');
    const dates = generateRecurringDates(start, { frequency: 'custom', count: 3, interval: 10 });
    expect(dates).toHaveLength(3);
    expect(dates[0].toISOString()).toBe('2026-03-01T10:00:00.000Z');
    expect(dates[1].toISOString()).toBe('2026-03-11T10:00:00.000Z');
    expect(dates[2].toISOString()).toBe('2026-03-21T10:00:00.000Z');
  });

  it('custom without interval defaults to 7 days', () => {
    const start = new Date('2026-03-01T10:00:00Z');
    const dates = generateRecurringDates(start, { frequency: 'custom', count: 3 });
    expect(dates).toHaveLength(3);
    const diffMs = dates[1].getTime() - dates[0].getTime();
    expect(diffMs).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('Constants', () => {
  it('MAX_RECURRING_OCCURRENCES is 24', () => {
    expect(MAX_RECURRING_OCCURRENCES).toBe(24);
  });

  it('MIN_RECURRING_OCCURRENCES is 2', () => {
    expect(MIN_RECURRING_OCCURRENCES).toBe(2);
  });

  it('backward-compat aliases match', () => {
    expect(MAX_RECURRING_WEEKS).toBe(MAX_RECURRING_OCCURRENCES);
    expect(MIN_RECURRING_WEEKS).toBe(MIN_RECURRING_OCCURRENCES);
  });

  it('FREQUENCY_LABELS has all frequencies', () => {
    expect(FREQUENCY_LABELS.weekly).toBe('Every week');
    expect(FREQUENCY_LABELS.biweekly).toBe('Every 2 weeks');
    expect(FREQUENCY_LABELS.monthly).toBe('Every month');
    expect(FREQUENCY_LABELS.custom).toBe('Custom interval');
  });
});
