import { describe, it, expect } from 'vitest'
import { cn, formatDateUTC, formatUTC } from '@/lib/utils'

describe('cn (className utility)', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('should handle conditional classes', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz')
    expect(cn('foo', true && 'bar', 'baz')).toBe('foo bar baz')
  })

  it('should handle undefined and null values', () => {
    expect(cn('foo', undefined, 'bar')).toBe('foo bar')
    expect(cn('foo', null, 'bar')).toBe('foo bar')
  })

  it('should merge conflicting Tailwind classes', () => {
    // twMerge should keep the last conflicting class
    expect(cn('p-4', 'p-2')).toBe('p-2')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
    expect(cn('bg-white', 'bg-gray-100')).toBe('bg-gray-100')
  })

  it('should handle arrays of classes', () => {
    expect(cn(['foo', 'bar'], 'baz')).toBe('foo bar baz')
  })

  it('should handle object syntax', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz')
  })

  it('should handle empty inputs', () => {
    expect(cn()).toBe('')
    expect(cn('')).toBe('')
  })
})

describe('formatDateUTC', () => {
  it('should format a date string with default options', () => {
    const result = formatDateUTC('2024-01-15T00:00:00.000Z')
    // Default format includes weekday, month, day, year
    expect(result).toContain('Jan')
    expect(result).toContain('15')
    expect(result).toContain('2024')
  })

  it('should format a Date object', () => {
    const date = new Date('2024-06-20T00:00:00.000Z')
    const result = formatDateUTC(date)
    expect(result).toContain('Jun')
    expect(result).toContain('20')
    expect(result).toContain('2024')
  })

  it('should use custom options when provided', () => {
    const result = formatDateUTC('2024-03-10T00:00:00.000Z', {
      weekday: undefined,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    // Should NOT include weekday
    expect(result).toContain('Mar')
    expect(result).toContain('10')
    expect(result).toContain('2024')
  })

  it('should handle dates stored as midnight UTC correctly', () => {
    // This is critical - dates stored as midnight UTC should not shift to previous day
    // when displayed in timezones west of UTC (like EST which is UTC-5)
    const midnightUTC = '2024-01-15T00:00:00.000Z'
    const result = formatDateUTC(midnightUTC)
    // Must show January 15, not January 14
    expect(result).toContain('15')
  })

  it('should format with long month option', () => {
    const result = formatDateUTC('2024-12-25T00:00:00.000Z', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    expect(result).toContain('December')
    expect(result).toContain('25')
    expect(result).toContain('2024')
  })

  it('should format with numeric month option', () => {
    const result = formatDateUTC('2024-07-04T00:00:00.000Z', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
    })
    // Numeric format: 7/4/2024
    expect(result).toMatch(/7/)
    expect(result).toMatch(/4/)
    expect(result).toContain('2024')
  })

  it('should handle end of year dates correctly', () => {
    const result = formatDateUTC('2024-12-31T00:00:00.000Z')
    expect(result).toContain('Dec')
    expect(result).toContain('31')
    expect(result).toContain('2024')
  })

  it('should handle beginning of year dates correctly', () => {
    const result = formatDateUTC('2024-01-01T00:00:00.000Z')
    expect(result).toContain('Jan')
    expect(result).toContain('1')
    expect(result).toContain('2024')
  })

  it('should handle leap year date correctly', () => {
    const result = formatDateUTC('2024-02-29T00:00:00.000Z')
    expect(result).toContain('Feb')
    expect(result).toContain('29')
    expect(result).toContain('2024')
  })
})

describe('formatUTC', () => {
  it('uses only the requested parts', () => {
    expect(formatUTC('2026-10-02T00:00:00.000Z', { month: 'short' })).toBe('Oct')
    expect(formatUTC('2026-10-02T00:00:00.000Z', { day: 'numeric' })).toBe('2')
  })

  it('keeps midnight-UTC calendar days on their day', () => {
    expect(formatUTC('2026-10-04T00:00:00.000Z', { weekday: 'long' })).toBe('Sunday')
  })
})
