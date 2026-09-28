import { describe, expect, it, vi } from 'vitest'
import {
  ensureSundaySchoolWeeklyLessons,
  getMeetingDatesInRange,
  getSundaysInRange,
  getUpcomingSundays,
  getWeeklyLessonStatus,
  validateWeeklyLessonResources,
} from '@/lib/sunday-school-lessons'

describe('weekly Sunday School lessons', () => {
  it('returns the upcoming Sunday and following seven normalized UTC Sundays', () => {
    const dates = getUpcomingSundays(new Date('2026-09-04T23:45:00-04:00'))
    expect(dates).toHaveLength(8)
    expect(dates.map(date => date.toISOString())).toEqual([
      '2026-09-06T00:00:00.000Z', '2026-09-13T00:00:00.000Z',
      '2026-09-20T00:00:00.000Z', '2026-09-27T00:00:00.000Z',
      '2026-10-04T00:00:00.000Z', '2026-10-11T00:00:00.000Z',
      '2026-10-18T00:00:00.000Z', '2026-10-25T00:00:00.000Z',
    ])
  })

  it('includes today when invoked on a Sunday', () => {
    expect(getUpcomingSundays(new Date('2026-09-06T18:00:00Z'))[0].toISOString())
      .toBe('2026-09-06T00:00:00.000Z')
  })

  it('enumerates every Sunday in an academic-year range', () => {
    const dates = getSundaysInRange(
      new Date('2026-09-01T00:00:00Z'),
      new Date('2027-05-31T23:59:59Z')
    )
    expect(dates[0].toISOString()).toBe('2026-09-06T00:00:00.000Z')
    expect(dates.at(-1)?.toISOString()).toBe('2027-05-30T00:00:00.000Z')
    expect(dates.every(date => date.getUTCDay() === 0)).toBe(true)
  })

  it('enumerates Saturdays for the Elementary calendar', () => {
    const dates = getMeetingDatesInRange(
      new Date('2026-09-01T00:00:00Z'),
      new Date('2026-09-27T23:59:59Z'),
      6
    )

    expect(dates.map(date => date.toISOString())).toEqual([
      '2026-09-05T00:00:00.000Z',
      '2026-09-12T00:00:00.000Z',
      '2026-09-19T00:00:00.000Z',
      '2026-09-26T00:00:00.000Z',
    ])
  })

  it('derives the three preparation states', () => {
    expect(getWeeklyLessonStatus(null, 2)).toBe('UNASSIGNED')
    expect(getWeeklyLessonStatus('owner-1', 0)).toBe('NEEDS_LINKS')
    expect(getWeeklyLessonStatus('owner-1', 1)).toBe('READY')
  })

  it('validates, trims, and preserves resource order', () => {
    expect(validateWeeklyLessonResources([
      { title: ' Slides ', url: ' https://slides.example.com/deck ' },
      { title: 'Worksheet', url: 'http://example.com/workbook' },
    ])).toEqual({
      ok: true,
      resources: [
        { title: 'Slides', url: 'https://slides.example.com/deck' },
        { title: 'Worksheet', url: 'http://example.com/workbook' },
      ],
    })
    expect(validateWeeklyLessonResources([{ title: '', url: 'https://example.com' }])).toMatchObject({ ok: false })
    expect(validateWeeklyLessonResources([{ title: 'File', url: 'ftp://example.com' }])).toMatchObject({ ok: false })
  })

  it('generates only in-year dates and relies on the unique key for idempotency', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'class-1',
        level: 'GRADE_6',
        academicYear: {
          startDate: new Date('2024-09-01T00:00:00Z'),
          endDate: new Date('2025-06-30T23:59:59Z'),
        },
        sundaySchoolYear: {
          startDate: new Date('2026-09-01T00:00:00Z'),
          endDate: new Date('2026-09-27T23:59:59Z'),
        },
      },
    ])
    const seen = new Set<string>()
    const createMany = vi.fn().mockImplementation(({ data }: { data: Array<{ classId: string; sundayDate: Date }> }) => {
      let count = 0
      for (const row of data) {
        const key = `${row.classId}:${row.sundayDate.toISOString()}`
        if (!seen.has(key)) { seen.add(key); count += 1 }
      }
      return { count }
    })
    const db = {
      sundaySchoolClass: { findMany },
      sundaySchoolWeeklyLesson: { createMany },
    }

    const first = await ensureSundaySchoolWeeklyLessons({
      db: db as never,
    })
    const second = await ensureSundaySchoolWeeklyLessons({
      db: db as never,
    })

    expect(first).toEqual({ classes: 1, attempted: 4, created: 4 })
    expect(second).toEqual({ classes: 1, attempted: 4, created: 0 })
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        isActive: true,
        OR: [
          { sundaySchoolYear: { status: 'OPEN' } },
          { sundaySchoolYearId: null, academicYear: { isActive: true } },
        ],
      }),
    }))
    expect(Array.from(seen)).toHaveLength(4)
  })

  it('generates Saturday lessons for Elementary and Sunday lessons for older classes', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 8 })
    const db = {
      sundaySchoolClass: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'elementary',
            level: 'GRADE_3',
            academicYear: {
              startDate: new Date('2026-09-01T00:00:00Z'),
              endDate: new Date('2026-09-27T23:59:59Z'),
            },
            sundaySchoolYear: null,
          },
          {
            id: 'middle',
            level: 'GRADE_6',
            academicYear: {
              startDate: new Date('2026-09-01T00:00:00Z'),
              endDate: new Date('2026-09-27T23:59:59Z'),
            },
            sundaySchoolYear: null,
          },
        ]),
      },
      sundaySchoolWeeklyLesson: { createMany },
    }

    await ensureSundaySchoolWeeklyLessons({ db: db as never })

    const rows = createMany.mock.calls[0][0].data as Array<{ classId: string; sundayDate: Date }>
    expect(rows.filter(row => row.classId === 'elementary').every(row => row.sundayDate.getUTCDay() === 6))
      .toBe(true)
    expect(rows.filter(row => row.classId === 'middle').every(row => row.sundayDate.getUTCDay() === 0))
      .toBe(true)
  })
})
