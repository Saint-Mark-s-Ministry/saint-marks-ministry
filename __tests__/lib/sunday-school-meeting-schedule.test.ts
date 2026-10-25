import { describe, expect, it } from 'vitest'
import { scheduledMeetingDates } from '@/lib/sunday-school-meeting-schedule'

const start = new Date('2026-01-01')
const end = new Date('2026-12-31')
describe('monthly servants meeting schedules', () => {
  it('schedules Elementary on the first Saturday in every month', () => {
    const dates = scheduledMeetingDates({ name: 'Elementary', levels: ['GRADE_1'] }, start, end)
    expect(dates).toHaveLength(12)
    expect(dates.every(date => date.getUTCDay() === 6 && date.getUTCDate() <= 7)).toBe(true)
    expect(dates[0].toISOString()).toBe('2026-01-03T00:00:00.000Z')
  })
  it('schedules Sunday groups on the third Sunday', () => {
    const dates = scheduledMeetingDates({ name: 'High School', levels: ['GRADE_9'] }, new Date('2027-01-01'), new Date('2027-12-31'))
    expect(dates).toHaveLength(12)
    expect(dates.every(date => date.getUTCDay() === 0 && date.getUTCDate() >= 15 && date.getUTCDate() <= 21)).toBe(true)
    expect(dates[1].toISOString()).toBe('2027-02-21T00:00:00.000Z')
  })
  it('starts Sunday meeting history on October 18, 2026', () => {
    const dates = scheduledMeetingDates({ name: 'Middle', levels: ['GRADE_6'] }, start, end)
    expect(dates.map(date => date.toISOString().slice(0, 10))).toEqual(['2026-10-18', '2026-11-15', '2026-12-20'])
    expect(scheduledMeetingDates({ name: 'Middle', levels: ['GRADE_6'] }, start, new Date('2026-10-17'))).toEqual([])
  })
  it('uses Elementary configuration and levels even if the group is renamed', () => {
    const dates = scheduledMeetingDates({ name: 'Young children', isElementary: true, levels: [] }, start, end)
    expect(dates[0].getUTCDay()).toBe(6)
    expect(scheduledMeetingDates({ name: 'Children', levels: ['GRADE_1'] }, start, end)).toEqual(dates)
  })
  it('keeps dates within a partial academic year and handles leap years', () => {
    const dates = scheduledMeetingDates({ name: 'Middle', levels: ['GRADE_6'] }, new Date('2028-02-21'), new Date('2028-04-15'))
    expect(dates.map(date => date.toISOString().slice(0, 10))).toEqual(['2028-03-19'])
  })
})
