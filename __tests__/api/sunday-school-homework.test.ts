import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  ageGroupFindMany: vi.fn(),
  guardianFindMany: vi.fn(),
  childFindUnique: vi.fn(),
  classFindMany: vi.fn(),
  childRosterFindMany: vi.fn(),
  weekFindMany: vi.fn(),
  weekFindUnique: vi.fn(),
  homeworkCreate: vi.fn(),
  homeworkFindUnique: vi.fn(),
  completionDeleteMany: vi.fn(),
  completionUpsert: vi.fn(),
  transaction: vi.fn(),
  getAccess: vi.fn(),
  canServe: vi.fn(),
  visibleFilter: vi.fn(),
  getElementaryClass: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: mocks.getAccess,
  canServeClass: mocks.canServe,
  visibleClassFilter: mocks.visibleFilter,
}))
vi.mock('@/lib/sunday-school-homework', () => ({
  classBelongsToElementaryBand: (cls: { level: string }, bands: Array<{ levels: string[] }>) =>
    bands.some(band => band.levels.includes(cls.level)),
  getElementaryClass: mocks.getElementaryClass,
  getHomeworkDueDate: (date: Date) => new Date(date.getTime() + 7 * 86_400_000),
  summarizeHomeworkStatuses: (statuses: Array<string | null>) => ({
    completed: statuses.filter(status => status === 'COMPLETED').length,
    notCompleted: statuses.filter(status => status === 'NOT_COMPLETED').length,
    notRecorded: statuses.filter(status => !status).length,
    completionRate: null,
  }),
  validateHomeworkResources: () => ({ ok: true, resources: [] }),
  isHomeworkCompletionStatus: (value: unknown) => value === 'COMPLETED' || value === 'NOT_COMPLETED',
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    sundaySchoolAgeGroup: { findMany: mocks.ageGroupFindMany },
    sundaySchoolChildGuardian: { findMany: mocks.guardianFindMany },
    sundaySchoolChild: { findUnique: mocks.childFindUnique, findMany: mocks.childRosterFindMany },
    sundaySchoolClass: { findMany: mocks.classFindMany },
    sundaySchoolWeeklyLesson: { findMany: mocks.weekFindMany, findUnique: mocks.weekFindUnique },
    sundaySchoolHomework: { create: mocks.homeworkCreate, findUnique: mocks.homeworkFindUnique },
    sundaySchoolHomeworkCompletion: {
      deleteMany: mocks.completionDeleteMany,
      upsert: mocks.completionUpsert,
    },
    $transaction: mocks.transaction,
  },
}))

import { GET, POST } from '@/app/api/sunday-school/homework/route'
import { POST as POST_COMPLETIONS } from '@/app/api/sunday-school/homework/[id]/completions/route'

describe('Sunday School homework API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.ageGroupFindMany.mockResolvedValue([{ sundaySchoolYearId: 'ss-year', levels: ['GRADE_4'] }])
    mocks.guardianFindMany.mockResolvedValue([])
    mocks.weekFindMany.mockResolvedValue([])
    mocks.classFindMany.mockResolvedValue([])
    mocks.childRosterFindMany.mockResolvedValue([])
    mocks.visibleFilter.mockReturnValue([])
    mocks.getAccess.mockResolvedValue({ canRead: true })
    mocks.canServe.mockReturnValue(true)
    mocks.getElementaryClass.mockResolvedValue({ id: 'class-1' })
    mocks.transaction.mockResolvedValue([])
    mocks.completionDeleteMany.mockReturnValue({ kind: 'delete' })
    mocks.completionUpsert.mockReturnValue({ kind: 'upsert' })
  })

  it('returns only linked children and their statuses to a parent', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'parent-1', role: 'PARENT' })
    mocks.guardianFindMany.mockResolvedValue([{
      child: {
        id: 'child-1', firstName: 'Anna', lastName: 'A', classId: 'class-1',
        class: { level: 'GRADE_4', sundaySchoolYearId: 'ss-year' },
      },
    }])
    mocks.weekFindMany.mockResolvedValue([{
      id: 'week-1', classId: 'class-1', sundayDate: new Date('2026-10-03T00:00:00.000Z'),
      class: { id: 'class-1', name: 'Grade 4', level: 'GRADE_4' },
      homework: {
        id: 'homework-1', title: 'Worksheet', instructions: null, archivedAt: null, resources: [],
        completions: [
          { childId: 'child-1', child: { id: 'child-1', firstName: 'Anna', lastName: 'A' }, status: 'COMPLETED', updatedAt: new Date() },
          { childId: 'child-2', child: { id: 'child-2', firstName: 'Beth', lastName: 'B' }, status: 'NOT_COMPLETED', updatedAt: new Date() },
        ],
      },
    }])

    const response = await GET(new Request('http://localhost/api/sunday-school/homework'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.eligible).toBe(true)
    expect(body.weeks[0].homework.completions).toEqual([
      expect.objectContaining({ childId: 'child-1', status: 'COMPLETED' }),
    ])
    expect(JSON.stringify(body)).not.toContain('Beth')
  })

  it('returns an ineligible empty response to an unlinked student', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'student-1', role: 'STUDENT' })
    mocks.childFindUnique.mockResolvedValue(null)
    const response = await GET(new Request('http://localhost/api/sunday-school/homework'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toMatchObject({ eligible: false, weeks: [], roster: [] })
  })

  it('rejects publishing to an older class even when the servant otherwise has access', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'servant-1', role: 'SERVANT' })
    mocks.weekFindUnique.mockResolvedValue({
      id: 'week-1', classId: 'older-class', homework: null,
      class: { academicYearId: 'academic-year' },
    })
    mocks.getElementaryClass.mockResolvedValue(null)
    const response = await POST(new Request('http://localhost/api/sunday-school/homework', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weeklyLessonId: 'week-1', title: 'Should fail', resources: [] }),
    }))
    expect(response.status).toBe(403)
    expect(mocks.getAccess).not.toHaveBeenCalled()
    expect(mocks.homeworkCreate).not.toHaveBeenCalled()
  })

  it('keeps priests read-only', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'priest-1', role: 'PRIEST' })
    mocks.weekFindUnique.mockResolvedValue({
      id: 'week-1', classId: 'class-1', homework: null,
      class: { academicYearId: 'academic-year' },
    })
    mocks.getAccess.mockResolvedValue({ canRead: true, readOnly: true })
    mocks.canServe.mockReturnValue(false)
    const response = await POST(new Request('http://localhost/api/sunday-school/homework', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weeklyLessonId: 'week-1', title: 'Should fail', resources: [] }),
    }))
    expect(response.status).toBe(403)
    expect(mocks.homeworkCreate).not.toHaveBeenCalled()
  })

  it('rejects completion records for children outside the homework class', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'servant-1', role: 'SERVANT' })
    mocks.homeworkFindUnique.mockResolvedValue({
      id: 'homework-1', weeklyLesson: { classId: 'class-1', class: { academicYearId: 'academic-year' } },
    })
    mocks.childRosterFindMany.mockResolvedValue([{ id: 'child-1' }])
    const response = await POST_COMPLETIONS(new Request('http://localhost/api/sunday-school/homework/homework-1/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [
        { childId: 'child-1', status: 'COMPLETED' },
        { childId: 'other-class-child', status: 'NOT_COMPLETED' },
      ] }),
    }), { params: Promise.resolve({ id: 'homework-1' }) })
    expect(response.status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('upserts recorded outcomes and deletes rows returned to Not recorded', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'servant-1', role: 'SERVANT' })
    mocks.homeworkFindUnique.mockResolvedValue({
      id: 'homework-1', weeklyLesson: { classId: 'class-1', class: { academicYearId: 'academic-year' } },
    })
    mocks.childRosterFindMany.mockResolvedValue([{ id: 'child-1' }, { id: 'child-2' }])
    const response = await POST_COMPLETIONS(new Request('http://localhost/api/sunday-school/homework/homework-1/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [
        { childId: 'child-1', status: 'COMPLETED' },
        { childId: 'child-2', status: null },
      ] }),
    }), { params: Promise.resolve({ id: 'homework-1' }) })
    expect(response.status).toBe(200)
    expect(mocks.completionUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { homeworkId_childId: { homeworkId: 'homework-1', childId: 'child-1' } },
      update: { status: 'COMPLETED', recordedById: 'servant-1' },
    }))
    expect(mocks.completionDeleteMany).toHaveBeenCalledWith({
      where: { homeworkId: 'homework-1', childId: 'child-2' },
    })
  })
})
