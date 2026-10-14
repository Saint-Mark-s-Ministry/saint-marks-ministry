import { describe, expect, it } from 'vitest'
import { AttendanceStatus } from '@prisma/client'
import { buildIndividualAttendance } from '@/lib/sunday-school-individual-attendance'

const child = { id: 'child-1', firstName: 'Mary', lastName: 'Hanna' }
const former = { id: 'child-2', firstName: 'John', lastName: 'Hanna' }

describe('individual attendance history', () => {
  it('keeps missing weeks unrecorded and excludes them from the rate', () => {
    const result = buildIndividualAttendance([child], [
      { date: '2026-10-04', attendance: [{ child, status: AttendanceStatus.PRESENT }] },
      { date: '2026-10-11', attendance: [{ child, status: AttendanceStatus.LATE }] },
    ], ['2026-09-27', '2026-10-04'])
    expect(result.dates).toEqual(['2026-09-27', '2026-10-04', '2026-10-11'])
    expect(result.children[0].attendance['2026-09-27']).toBeUndefined()
    expect(result.children[0].rate).toBe(75)
    expect(result.children[0].counts).toEqual({ present: 1, late: 1, absent: 0, excused: 0 })
  })
  it('preserves historical attendees and gives children with only excused or no marks no rate', () => {
    const result = buildIndividualAttendance([child], [
      { date: new Date('2026-10-04T00:00:00Z'), attendance: [{ child: former, status: AttendanceStatus.EXCUSED }] },
    ])
    expect(result.children.map(row => [row.id, row.onRoster, row.rate])).toEqual([
      ['child-2', false, null], ['child-1', true, null],
    ])
  })
  it('counts absence and excludes excused marks from the denominator', () => {
    const result = buildIndividualAttendance([child], ['PRESENT', 'ABSENT', 'EXCUSED'].map((status, i) => ({
      date: `2026-10-0${i + 1}`, attendance: [{ child, status: status as AttendanceStatus }],
    })))
    expect(result.children[0].rate).toBe(50)
  })
})
