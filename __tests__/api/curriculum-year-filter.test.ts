import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), year: vi.fn(), lessons: vi.fn(), count: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  academicYear: { findUnique: mocks.year },
  lesson: { findMany: mocks.lessons, count: mocks.count },
} }))
vi.mock('@/lib/notifications', () => ({ notifyLessonScheduled: vi.fn() }))

import { GET } from '@/app/api/lessons/route'

const year = {
  startDate: new Date('2026-09-01T00:00:00Z'),
  endDate: new Date('2027-08-31T00:00:00Z'),
}
const fixtures = [
  ['before-start', '2026-08-31', 'old-year'],
  ['first-day', '2026-09-01', 'current-year'],
  ['thanksgiving', '2026-11-27', 'current-year'],
  ['priesthood', '2026-12-04', 'old-year'],
  ['liturgy', '2027-01-01', 'old-year'],
  ['eucharist', '2027-02-12', 'old-year'],
  ['last-day', '2027-08-31', 'old-year'],
  ['next-year', '2027-09-01', 'current-year'],
].map(([id, day, academicYearId]) => ({ id, scheduledDate: new Date(`${day}T00:00:00Z`), academicYearId }))

async function get(query = '') {
  return GET(new Request(`http://localhost/api/lessons${query}`))
}

describe('Curriculum academic year filter', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.auth.mockResolvedValue({ id: 'admin', role: 'SUPER_ADMIN' })
    mocks.year.mockResolvedValue(year)
    mocks.lessons.mockImplementation(async ({ where, skip, take }) => {
      const results = fixtures.filter(lesson =>
        (!where.academicYearId || lesson.academicYearId === where.academicYearId) &&
        (!where.scheduledDate || (
          lesson.scheduledDate >= where.scheduledDate.gte &&
          lesson.scheduledDate < where.scheduledDate.lt
        ))
      )
      return take ? results.slice(skip, skip + take) : results
    })
    mocks.count.mockResolvedValue(6)
  })

  it('includes December and next-calendar-year lessons with older saved assignments', async () => {
    const response = await get('?scheduledInAcademicYearId=current-year')
    expect(response.status).toBe(200)
    expect((await response.json()).map((lesson: { id: string }) => lesson.id)).toEqual([
      'first-day', 'thanksgiving', 'priesthood', 'liturgy', 'eucharist', 'last-day',
    ])
    expect(mocks.lessons.mock.calls[0][0].where).not.toHaveProperty('academicYearId')
  })

  it('leaves attendance and reporting assignment filters unchanged', async () => {
    const response = await get('?academicYearId=current-year')
    expect((await response.json()).map((lesson: { id: string }) => lesson.id)).toEqual([
      'first-day', 'thanksgiving', 'next-year',
    ])
    expect(mocks.year).not.toHaveBeenCalled()
  })

  it('returns all lessons when no year is selected', async () => {
    const response = await get()
    expect(await response.json()).toHaveLength(fixtures.length)
    expect(mocks.year).not.toHaveBeenCalled()
  })

  it('treats year boundaries as whole UTC calendar days', async () => {
    mocks.year.mockResolvedValue({
      startDate: new Date('2026-09-01T12:00:00Z'),
      endDate: new Date('2027-08-31T12:00:00Z'),
    })
    await get('?scheduledInAcademicYearId=current-year')
    expect(mocks.lessons.mock.calls[0][0].where.scheduledDate).toEqual({
      gte: new Date('2026-09-01T00:00:00Z'),
      lt: new Date('2027-09-01T00:00:00Z'),
    })
  })

  it('preserves section, status, search, and exam-day filters alongside the date range', async () => {
    await get('?scheduledInAcademicYearId=current-year&examSectionId=ritual&status=SCHEDULED&excludeExamDays=true&search=Liturgy')
    expect(mocks.lessons).toHaveBeenCalledWith(expect.objectContaining({ where: {
      scheduledDate: { gte: year.startDate, lt: new Date('2027-09-01T00:00:00Z') },
      examSectionId: 'ritual', status: 'SCHEDULED', isExamDay: { not: true },
      OR: [
        { title: { contains: 'Liturgy', mode: 'insensitive' } },
        { subtitle: { contains: 'Liturgy', mode: 'insensitive' } },
      ],
    } }))
  })

  it('uses the same date range for pagination and totals', async () => {
    const response = await get('?scheduledInAcademicYearId=current-year&page=2&limit=2')
    expect(await response.json()).toMatchObject({
      data: [{ id: 'priesthood' }, { id: 'liturgy' }],
      pagination: { page: 2, limit: 2, total: 6, totalPages: 3 },
    })
    expect(mocks.count.mock.calls[0][0].where).toEqual(mocks.lessons.mock.calls[0][0].where)
  })

  it('rejects an unknown year instead of returning an unfiltered schedule', async () => {
    mocks.year.mockResolvedValue(null)
    expect((await get('?scheduledInAcademicYearId=missing')).status).toBe(404)
    expect(mocks.lessons).not.toHaveBeenCalled()
  })

  it('requires authentication before looking up the year or lessons', async () => {
    mocks.auth.mockRejectedValue(new Error('Unauthorized'))
    expect((await get('?scheduledInAcademicYearId=current-year')).status).toBe(401)
    expect(mocks.year).not.toHaveBeenCalled()
    expect(mocks.lessons).not.toHaveBeenCalled()
  })
})
