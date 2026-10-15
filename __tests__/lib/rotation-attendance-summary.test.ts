import { describe, expect, it } from 'vitest'
import { rotationAttendanceSummary, rotationAttendanceToDate } from '@/lib/sunday-school-utils'

describe('rotation attendance summary', () => {
  it('weights elapsed weeks across rotations and excludes excused weeks', () => {
    expect(rotationAttendanceSummary([
      { attendance: { present: 4, absent: 0, excused: 0, effectiveTotal: 4 } },
      { attendance: { present: 0, absent: 1, excused: 1, effectiveTotal: 1 } },
      { attendance: null },
    ])).toEqual({ present: 4, absent: 1, excused: 1, effectiveTotal: 5, percentage: 80, met: true })
  })

  it('does not count future rotation weeks as missed', () => {
    const attendance = rotationAttendanceToDate({
      startDate: '2026-10-11T00:00:00Z', totalWeeks: 4,
      logs: [{ weekNumber: 1, status: 'VERIFIED' }],
    }, new Date('2026-10-15T00:00:00Z'))
    expect(rotationAttendanceSummary([{ attendance }])).toMatchObject({ effectiveTotal: 1, percentage: 100, met: true })
  })

  it('keeps attendance unknown without countable rotation weeks', () => {
    expect(rotationAttendanceSummary([])).toMatchObject({ percentage: null, met: true })
    expect(rotationAttendanceSummary([{ attendance: null }])).toMatchObject({ percentage: null, met: true })
  })
})
