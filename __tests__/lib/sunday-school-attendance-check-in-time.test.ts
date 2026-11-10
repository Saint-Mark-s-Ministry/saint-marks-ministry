import { describe, expect, it } from 'vitest'
import { checkInIsOpen, getClassCheckInWindow, isCheckInMeetingToday } from '@/lib/sunday-school-attendance-check-in-time'

describe('class attendance QR windows', () => {
  it.each([
    ['2026-11-14', 'GRADE_1', '2026-11-14T15:30:00.000Z', '2026-11-14T17:30:00.000Z'],
    ['2026-11-15', 'GRADE_6', '2026-11-15T16:30:00.000Z', '2026-11-15T18:30:00.000Z'],
    ['2027-06-12', 'GRADE_1', '2027-06-12T14:30:00.000Z', '2027-06-12T16:30:00.000Z'],
    ['2027-06-13', 'GRADE_6', '2027-06-13T15:30:00.000Z', '2027-06-13T17:30:00.000Z'],
    ['2027-03-14', 'GRADE_6', '2027-03-14T15:30:00.000Z', '2027-03-14T17:30:00.000Z'],
  ] as const)('uses church-local time for %s, including DST', (date, level, opens, expires) => {
    const window = getClassCheckInWindow(date, level)!
    expect(window.opensAt.toISOString()).toBe(opens)
    expect(window.expiresAt.toISOString()).toBe(expires)
    expect(checkInIsOpen({ ...window, closedAt: null }, new Date(Date.parse(opens) - 1))).toBe(false)
    expect(checkInIsOpen({ ...window, closedAt: null }, new Date(opens))).toBe(true)
    expect(checkInIsOpen({ ...window, closedAt: null }, new Date(Date.parse(expires) - 1))).toBe(true)
    expect(checkInIsOpen({ ...window, closedAt: null }, new Date(expires))).toBe(false)
    expect(checkInIsOpen({ ...window, closedAt: new Date(opens) }, new Date(opens))).toBe(false)
  })
  it('separates Saturday and Sunday classes and rejects invalid dates', () => {
    expect(getClassCheckInWindow('2026-11-15', 'GRADE_1')).toBeNull()
    expect(getClassCheckInWindow('2026-11-14', 'GRADE_6')).toBeNull()
    expect(getClassCheckInWindow('2026-02-30', 'GRADE_6')).toBeNull()
    expect(getClassCheckInWindow('invalid', 'GRADE_6')).toBeNull()
    expect(isCheckInMeetingToday('2026-11-14', 'GRADE_1', new Date('2026-11-15T02:00:00Z'))).toBe(true)
    expect(isCheckInMeetingToday('2026-11-14', 'GRADE_1', new Date('2026-11-15T06:00:00Z'))).toBe(false)
  })
})
