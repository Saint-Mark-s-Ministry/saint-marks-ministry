import { describe, expect, it } from 'vitest'
import { normalizePhone, parseBirthDate, sameChildName } from '@/lib/parent-registration'

const now = new Date('2026-10-06T12:00:00.000Z')

describe('parseBirthDate', () => {
  it('accepts a real calendar date and returns UTC midnight', () => {
    expect(parseBirthDate('2019-02-28', now)?.toISOString()).toBe('2019-02-28T00:00:00.000Z')
    expect(parseBirthDate('2020-02-29', now)?.toISOString()).toBe('2020-02-29T00:00:00.000Z')
  })

  it('rejects days that do not exist, instead of rolling them into the next month', () => {
    expect(parseBirthDate('2019-02-31', now)).toBeNull()
    expect(parseBirthDate('2019-02-29', now)).toBeNull()
    expect(parseBirthDate('2019-13-01', now)).toBeNull()
    expect(parseBirthDate('2019-04-31', now)).toBeNull()
  })

  it('rejects future dates, years before 1950, and other formats', () => {
    expect(parseBirthDate('2026-10-07', now)).toBeNull()
    expect(parseBirthDate('1949-12-31', now)).toBeNull()
    expect(parseBirthDate('10/05/2019', now)).toBeNull()
    expect(parseBirthDate('2019-2-3', now)).toBeNull()
    expect(parseBirthDate(null, now)).toBeNull()
    expect(parseBirthDate(20190203, now)).toBeNull()
  })

  it('accepts today', () => {
    expect(parseBirthDate('2026-10-06', now)).not.toBeNull()
  })
})

describe('normalizePhone', () => {
  it('strips spaces, dashes, dots, and brackets to digits', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('5551234567')
    expect(normalizePhone('555.123.4567')).toBe('5551234567')
  })

  it('keeps a leading + for international numbers', () => {
    expect(normalizePhone('+1 555 123 4567')).toBe('+15551234567')
  })

  it('rejects letters, too few digits, and too many digits', () => {
    expect(normalizePhone('555-CALL-ME')).toBeNull()
    expect(normalizePhone('12345')).toBeNull()
    expect(normalizePhone('1'.repeat(16))).toBeNull()
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
  })
})

describe('sameChildName', () => {
  it('ignores case and surrounding spaces', () => {
    expect(sameChildName(' Anna ', 'anna')).toBe(true)
    expect(sameChildName('Anna', 'Ana')).toBe(false)
  })
})
