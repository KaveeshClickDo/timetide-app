import { describe, it, expect } from 'vitest'
import { cn, formatDate, formatTime, formatDuration, getInitials, slugify, capitalize } from '../utils'

// ---------------------------------------------------------------------------
// cn (className merger)
// ---------------------------------------------------------------------------
describe('cn', () => {
  it('merges class names', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1')
  })

  it('deduplicates conflicting tailwind classes (last wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'end')).toBe('base end')
  })

  it('handles undefined and null inputs', () => {
    expect(cn('a', undefined, null, 'b')).toBe('a b')
  })

  it('returns empty string for no inputs', () => {
    expect(cn()).toBe('')
  })
})

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe('formatDate', () => {
  it('formats a date in en-US long format', () => {
    const date = new Date('2026-03-19T12:00:00Z')
    const result = formatDate(date)
    expect(result).toContain('March')
    expect(result).toContain('19')
    expect(result).toContain('2026')
  })

  it('accepts custom options', () => {
    const date = new Date('2026-01-15T12:00:00Z')
    const result = formatDate(date, { month: 'short' })
    expect(result).toContain('Jan')
  })
})

// ---------------------------------------------------------------------------
// formatTime
// ---------------------------------------------------------------------------
describe('formatTime', () => {
  it('formats time in 12-hour format', () => {
    const date = new Date('2026-03-19T14:30:00Z')
    const result = formatTime(date, 'UTC')
    expect(result).toBe('2:30 PM')
  })

  it('formats morning time', () => {
    const date = new Date('2026-03-19T09:00:00Z')
    const result = formatTime(date, 'UTC')
    expect(result).toBe('9:00 AM')
  })

  it('formats midnight as 12:00 AM', () => {
    const date = new Date('2026-03-19T00:00:00Z')
    const result = formatTime(date, 'UTC')
    expect(result).toBe('12:00 AM')
  })
})

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------
describe('formatDuration', () => {
  it('formats minutes under 60', () => {
    expect(formatDuration(15)).toBe('15 min')
    expect(formatDuration(45)).toBe('45 min')
  })

  it('formats exact hours', () => {
    expect(formatDuration(60)).toBe('1 hr')
    expect(formatDuration(120)).toBe('2 hr')
  })

  it('formats hours and minutes', () => {
    expect(formatDuration(90)).toBe('1 hr 30 min')
    expect(formatDuration(150)).toBe('2 hr 30 min')
  })

  it('handles zero minutes', () => {
    expect(formatDuration(0)).toBe('0 min')
  })

  it('handles single minute', () => {
    expect(formatDuration(1)).toBe('1 min')
  })

  it('handles large durations', () => {
    expect(formatDuration(480)).toBe('8 hr')
    expect(formatDuration(485)).toBe('8 hr 5 min')
  })
})

// ---------------------------------------------------------------------------
// getInitials
// ---------------------------------------------------------------------------
describe('getInitials', () => {
  it('returns first two initials', () => {
    expect(getInitials('John Doe')).toBe('JD')
  })

  it('handles single name', () => {
    expect(getInitials('John')).toBe('J')
  })

  it('limits to 2 characters for long names', () => {
    expect(getInitials('John Michael Doe')).toBe('JM')
  })

  it('uppercases initials', () => {
    expect(getInitials('john doe')).toBe('JD')
  })
})

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------
describe('slugify', () => {
  it('converts text to lowercase slug', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('replaces special characters', () => {
    expect(slugify('Hello, World!')).toBe('hello-world')
  })

  it('collapses multiple separators', () => {
    expect(slugify('hello---world')).toBe('hello-world')
    expect(slugify('hello   world')).toBe('hello-world')
    expect(slugify('hello___world')).toBe('hello-world')
  })

  it('trims leading and trailing dashes', () => {
    expect(slugify('-hello world-')).toBe('hello-world')
  })

  it('handles already slugified text', () => {
    expect(slugify('already-a-slug')).toBe('already-a-slug')
  })
})

// ---------------------------------------------------------------------------
// capitalize
// ---------------------------------------------------------------------------
describe('capitalize', () => {
  it('capitalizes first letter', () => {
    expect(capitalize('hello')).toBe('Hello')
  })

  it('lowercases rest of string', () => {
    expect(capitalize('hELLO')).toBe('Hello')
  })

  it('handles single character', () => {
    expect(capitalize('a')).toBe('A')
  })

  it('handles already capitalized text', () => {
    expect(capitalize('Hello')).toBe('Hello')
  })

  it('handles all uppercase', () => {
    expect(capitalize('WORLD')).toBe('World')
  })
})
