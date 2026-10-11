import { describe, expect, it } from 'vitest'
import { asyncPeriodStart, excludeAsyncPeriodRecords, isAsyncPeriodLesson } from '@/lib/attendance-utils'

const approvedFriEvening = new Date('2026-10-02T18:59:07Z')

describe('async period', () => {
  it('starts at the beginning of the day the student was switched', () => {
    expect(asyncPeriodStart({ isAsyncStudent: true, asyncApprovedAt: approvedFriEvening })?.toISOString()).toBe('2026-10-02T00:00:00.000Z')
    expect(asyncPeriodStart({ isAsyncStudent: false, asyncApprovedAt: approvedFriEvening })).toBeNull()
  })

  it('treats a legacy async flag with no date as starting today', () => {
    const now = new Date('2026-10-03T12:00:00Z')
    expect(asyncPeriodStart({ isAsyncStudent: true, asyncApprovedAt: null }, now)?.toISOString()).toBe('2026-10-03T00:00:00.000Z')
  })

  it('includes the lesson on the day they were switched, not the week before', () => {
    const start = asyncPeriodStart({ isAsyncStudent: true, asyncApprovedAt: approvedFriEvening })
    expect(isAsyncPeriodLesson('2026-10-02T00:00:00Z', start)).toBe(true)
    expect(isAsyncPeriodLesson('2026-10-09T00:00:00Z', start)).toBe(true)
    expect(isAsyncPeriodLesson('2026-09-25T00:00:00Z', start)).toBe(false)
    expect(isAsyncPeriodLesson('2026-10-09T00:00:00Z', null)).toBe(false)
  })

  it('builds a filter only for async students, keeping slip-marked lessons', () => {
    expect(excludeAsyncPeriodRecords([{ studentId: 'a', isAsyncStudent: false }])).toEqual({})
    expect(excludeAsyncPeriodRecords([
      { studentId: 'a', isAsyncStudent: false },
      { studentId: 'b', isAsyncStudent: true, asyncApprovedAt: approvedFriEvening },
    ])).toEqual({
      NOT: { OR: [{ studentId: 'b', slipId: null, lesson: { scheduledDate: { gte: new Date('2026-10-02T00:00:00Z') } } }] },
    })
  })
})
