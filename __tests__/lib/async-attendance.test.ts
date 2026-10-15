import { describe, expect, it } from 'vitest'
import { excludeAsyncLessonRecords } from '@/lib/attendance-utils'

describe('async lesson attendance exemption', () => {
  it('excludes every lesson for currently async students, including missing or later approval dates', () => {
    const enrollments = [
      { studentId: 'async-later-approved', isAsyncStudent: true, asyncApprovedAt: '2026-10-15T18:00:00Z' },
      { studentId: 'legacy', isAsyncStudent: true, asyncApprovedAt: null },
      { studentId: 'regular', isAsyncStudent: false, asyncApprovedAt: '2026-10-01T00:00:00Z' },
    ]
    expect(excludeAsyncLessonRecords(enrollments)).toEqual({ NOT: { studentId: { in: ['async-later-approved', 'legacy'] } } })
  })

  it('leaves in-person students and their historical records countable', () => {
    expect(excludeAsyncLessonRecords([{ studentId: 'regular', isAsyncStudent: false }])).toEqual({})
    expect(excludeAsyncLessonRecords([])).toEqual({})
  })
})
