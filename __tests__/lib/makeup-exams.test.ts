import { describe, expect, it } from 'vitest'
import { makeupToday, upcomingMakeupFridays, isMakeupFriday, makeupExamReason } from '@/lib/makeup-exams'

describe('makeup exam calendar', () => {
  it('uses the church date near UTC midnight', () => {
    expect(makeupToday(new Date('2026-10-10T01:00:00Z'))).toBe('2026-10-09')
  })
  it('offers twelve Fridays and excludes the current Friday', () => {
    const now = new Date('2026-10-09T15:00:00Z')
    const dates = upcomingMakeupFridays(now)
    expect(dates).toHaveLength(12)
    expect(dates[0]).toBe('2026-10-16')
    expect(dates.every(date => new Date(date).getUTCDay() === 5)).toBe(true)
    expect(isMakeupFriday('2026-10-09', now)).toBe(false)
    expect(isMakeupFriday('2026-10-17', now)).toBe(false)
    expect(isMakeupFriday('2027-01-08', now)).toBe(false)
    expect(isMakeupFriday('2026-10-16', now)).toBe(true)
  })
  it('includes the next day when Thursday is the church date', () => {
    expect(upcomingMakeupFridays(new Date('2026-10-09T01:00:00Z'))[0]).toBe('2026-10-09')
  })
})

describe('makeup exam eligibility', () => {
  it('permits missing scores and failed scores including zero', () => {
    expect(makeupExamReason(null, 60)).toBe('MISSED')
    expect(makeupExamReason(0, 60)).toBe('FAILED')
    expect(makeupExamReason(59.99, 60)).toBe('FAILED')
  })
  it('excludes scores at or above the passing threshold', () => {
    expect(makeupExamReason(60, 60)).toBeNull()
    expect(makeupExamReason(100, 60)).toBeNull()
  })
  it('uses the section threshold rather than a fixed percentage', () => {
    expect(makeupExamReason(70, 75)).toBe('FAILED')
    expect(makeupExamReason(70, 65)).toBeNull()
  })
})
