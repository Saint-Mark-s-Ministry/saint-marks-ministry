import { describe, expect, it } from 'vitest'
import { AttendanceStatus, SundaySchoolServantAttendanceStatus } from '@prisma/client'
import {
  buildSundaySchoolAttendanceTrend,
  getFirstSundayAfterSeptember11,
  getSundaySchoolReportingRange,
} from '@/lib/sunday-school-dashboard'

describe('Sunday School dashboard attendance trend', () => {
  it('starts on the first Sunday strictly after September 11', () => {
    expect(getFirstSundayAfterSeptember11(2026).toISOString()).toBe(
      '2026-09-13T00:00:00.000Z'
    )

    // September 11, 2022 was itself a Sunday, so the reporting year begins
    // the following Sunday rather than on the feast day.
    expect(getFirstSundayAfterSeptember11(2022).toISOString()).toBe(
      '2022-09-18T00:00:00.000Z'
    )
  })

  it('caps an active year at the most recent Sunday', () => {
    const range = getSundaySchoolReportingRange(
      new Date('2025-09-01T00:00:00.000Z'),
      true,
      new Date('2026-09-03T15:00:00.000Z')
    )

    expect(range.start.toISOString()).toBe('2025-09-14T00:00:00.000Z')
    expect(range.end.toISOString()).toBe('2026-08-30T00:00:00.000Z')
  })

  it('uses Saturdays for an Elementary reporting calendar', () => {
    const range = getSundaySchoolReportingRange(
      new Date('2025-09-01T00:00:00.000Z'),
      true,
      new Date('2026-09-03T15:00:00.000Z'),
      6
    )

    expect(range.start.toISOString()).toBe('2025-09-13T00:00:00.000Z')
    expect(range.end.toISOString()).toBe('2026-08-29T00:00:00.000Z')
  })

  it('aggregates visible classes and leaves an unrecorded Sunday as a gap', () => {
    const points = buildSundaySchoolAttendanceTrend(
      [
        {
          classId: 'class-a',
          date: new Date('2025-09-14T00:00:00.000Z'),
          attendance: [
            { status: AttendanceStatus.PRESENT },
            { status: AttendanceStatus.LATE },
            { status: AttendanceStatus.ABSENT },
            { status: AttendanceStatus.EXCUSED },
          ],
        },
        {
          classId: 'class-b',
          date: new Date('2025-09-14T00:00:00.000Z'),
          attendance: [
            { status: AttendanceStatus.PRESENT },
            { status: AttendanceStatus.ABSENT },
          ],
        },
        {
          classId: 'class-a',
          date: new Date('2025-09-21T00:00:00.000Z'),
          attendance: [],
        },
        {
          classId: 'class-a',
          date: new Date('2025-09-28T00:00:00.000Z'),
          attendance: [{ status: AttendanceStatus.PRESENT }],
        },
      ],
      new Date('2025-09-14T00:00:00.000Z'),
      new Date('2025-09-28T00:00:00.000Z')
    )

    expect(points).toEqual([
      {
        date: '2025-09-14',
        attendedCount: 3,
        recordedCount: 6,
        recordedClassCount: 2,
        attendanceRate: 50,
      },
      {
        date: '2025-09-21',
        attendedCount: null,
        recordedCount: null,
        recordedClassCount: 0,
        attendanceRate: null,
      },
      {
        date: '2025-09-28',
        attendedCount: 1,
        recordedCount: 1,
        recordedClassCount: 1,
        attendanceRate: 100,
      },
    ])
  })

  it('returns no future points when the reporting year has not begun', () => {
    const range = getSundaySchoolReportingRange(
      new Date('2026-09-01T00:00:00.000Z'),
      true,
      new Date('2026-09-03T15:00:00.000Z')
    )

    expect(buildSundaySchoolAttendanceTrend([], range.start, range.end)).toEqual([])
  })

  it('plots Elementary attendance on Saturdays', () => {
    const points = buildSundaySchoolAttendanceTrend(
      [{
        classId: 'class-a',
        date: new Date('2025-09-13T00:00:00.000Z'),
        attendance: [{ status: AttendanceStatus.PRESENT }],
      }],
      new Date('2025-09-13T00:00:00.000Z'),
      new Date('2025-09-20T00:00:00.000Z'),
      6
    )

    expect(points.map(point => point.date)).toEqual(['2025-09-13', '2025-09-20'])
    expect(points[0].attendanceRate).toBe(100)
  })

  it('builds binary servant totals and preserves weeks with no servant marks as gaps', () => {
    const points = buildSundaySchoolAttendanceTrend(
      [
        {
          classId: 'class-a',
          date: new Date('2025-09-14T00:00:00.000Z'),
          attendance: [
            { status: SundaySchoolServantAttendanceStatus.PRESENT },
            { status: SundaySchoolServantAttendanceStatus.ABSENT },
          ],
        },
        {
          classId: 'class-a',
          date: new Date('2025-09-21T00:00:00.000Z'),
          attendance: [],
        },
      ],
      new Date('2025-09-14T00:00:00.000Z'),
      new Date('2025-09-21T00:00:00.000Z')
    )

    expect(points).toEqual([
      {
        date: '2025-09-14',
        attendedCount: 1,
        recordedCount: 2,
        recordedClassCount: 1,
        attendanceRate: 50,
      },
      {
        date: '2025-09-21',
        attendedCount: null,
        recordedCount: null,
        recordedClassCount: 0,
        attendanceRate: null,
      },
    ])
  })
})
