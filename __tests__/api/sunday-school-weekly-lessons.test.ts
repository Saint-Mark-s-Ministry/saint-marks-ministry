import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getAccess: vi.fn(),
  canAssign: vi.fn(),
  canEdit: vi.fn(),
  visibleFilter: vi.fn(),
  guardianFindMany: vi.fn(),
  childFindUnique: vi.fn(),
  sundaySchoolYearFindFirst: vi.fn(),
  lessonFindMany: vi.fn(),
  lessonFindUnique: vi.fn(),
  assignmentFindFirst: vi.fn(),
  lessonUpdate: vi.fn(),
  resourceDeleteMany: vi.fn(),
  resourceCreateMany: vi.fn(),
  lessonFindUniqueOrThrow: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: mocks.getAccess,
  canAssignWeeklyLessonOwner: mocks.canAssign,
  canEditWeeklyLesson: mocks.canEdit,
  visibleClassFilter: mocks.visibleFilter,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    sundaySchoolChildGuardian: { findMany: mocks.guardianFindMany },
    sundaySchoolChild: { findUnique: mocks.childFindUnique },
    sundaySchoolYear: { findFirst: mocks.sundaySchoolYearFindFirst },
    sundaySchoolWeeklyLesson: {
      findMany: mocks.lessonFindMany,
      findUnique: mocks.lessonFindUnique,
    },
    sundaySchoolServantAssignment: { findFirst: mocks.assignmentFindFirst },
    $transaction: mocks.transaction,
  },
}))

import { GET } from '@/app/api/sunday-school/lessons/route'
import { PATCH } from '@/app/api/sunday-school/lessons/[id]/route'

const routeContext = { params: Promise.resolve({ id: 'lesson-1' }) }

function patchRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/sunday-school/lessons/lesson-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('weekly lesson API permissions and saves', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'servant-1', role: 'SERVANT' })
    mocks.getAccess.mockResolvedValue({ canRead: true })
    mocks.canAssign.mockReturnValue(false)
    mocks.canEdit.mockReturnValue(false)
    mocks.visibleFilter.mockReturnValue(['class-1'])
    mocks.guardianFindMany.mockResolvedValue([])
    mocks.childFindUnique.mockResolvedValue(null)
    mocks.sundaySchoolYearFindFirst.mockResolvedValue({
      id: 'sunday-year-2026',
      startDate: new Date('2026-09-11T00:00:00.000Z'),
      endDate: new Date('2027-09-10T00:00:00.000Z'),
    })
    mocks.lessonFindMany.mockResolvedValue([])
    mocks.lessonFindUnique.mockResolvedValue({
      id: 'lesson-1',
      classId: 'class-1',
      ownerId: 'owner-1',
      class: { academicYearId: 'year-1' },
    })
    mocks.assignmentFindFirst.mockResolvedValue({ id: 'assignment-1' })
    mocks.lessonFindUniqueOrThrow.mockResolvedValue({
      id: 'lesson-1', classId: 'class-1', ownerId: 'owner-1',
      class: { id: 'class-1', name: 'Grade 4', level: 'GRADE_4' },
      owner: { id: 'owner-1', name: 'Owner', profileImageUrl: null },
      resources: [
        { id: 'r1', weeklyLessonId: 'lesson-1', title: 'Slides', url: 'https://example.com/slides', sortOrder: 0 },
        { id: 'r2', weeklyLessonId: 'lesson-1', title: 'Video', url: 'https://example.com/video', sortOrder: 1 },
      ],
    })
    mocks.transaction.mockImplementation(async callback => callback({
      sundaySchoolWeeklyLesson: {
        update: mocks.lessonUpdate,
        findUniqueOrThrow: mocks.lessonFindUniqueOrThrow,
      },
      sundaySchoolWeeklyLessonResource: {
        deleteMany: mocks.resourceDeleteMany,
        createMany: mocks.resourceCreateMany,
      },
    }))
  })

  it('deduplicates sibling class access for a parent and blocks cross-class requests', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'parent-1', role: 'PARENT' })
    mocks.guardianFindMany.mockResolvedValue([
      { child: { classId: 'class-1' } },
      { child: { classId: 'class-1' } },
    ])

    const response = await GET(new Request('http://localhost/api/sunday-school/lessons'))
    expect(response.status).toBe(200)
    expect(mocks.lessonFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ classId: { in: ['class-1'] } }),
    }))

    const forbidden = await GET(new Request('http://localhost/api/sunday-school/lessons?classId=class-2'))
    expect(forbidden.status).toBe(403)
  })

  it('returns no lessons for an unlinked student account', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'student-1', role: 'STUDENT' })
    const response = await GET(new Request('http://localhost/api/sunday-school/lessons'))
    expect(response.status).toBe(200)
    expect(mocks.lessonFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ classId: { in: [] } }),
    }))
  })

  it('scopes a linked student account to exactly its child class', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'student-1', role: 'STUDENT' })
    mocks.childFindUnique.mockResolvedValue({ classId: 'class-1', isActive: true })
    const response = await GET(new Request('http://localhost/api/sunday-school/lessons'))
    expect(response.status).toBe(200)
    expect(mocks.lessonFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ classId: { in: ['class-1'] } }),
    }))
  })

  it('uses the open Sunday School year for the full-year schedule', async () => {
    const response = await GET(new Request('http://localhost/api/sunday-school/lessons?scope=year'))

    expect(response.status).toBe(200)
    expect(mocks.lessonFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        sundayDate: {
          gte: new Date('2026-09-11T00:00:00.000Z'),
          lte: new Date('2027-09-10T00:00:00.000Z'),
        },
        class: { isActive: true, sundaySchoolYearId: 'sunday-year-2026' },
      }),
    }))
  })

  it('keeps a non-owner servant read-only', async () => {
    const response = await PATCH(patchRequest({ title: 'Changed' }), routeContext)
    expect(response.status).toBe(403)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('lets the owner replace multiple named links atomically and preserves order', async () => {
    mocks.canEdit.mockReturnValue(true)
    const response = await PATCH(patchRequest({
      title: ' The Good Samaritan ',
      resources: [
        { title: ' Slides ', url: 'https://example.com/slides' },
        { title: 'Video', url: 'https://example.com/video' },
      ],
    }), routeContext)

    expect(response.status).toBe(200)
    expect(mocks.resourceDeleteMany).toHaveBeenCalledWith({ where: { weeklyLessonId: 'lesson-1' } })
    expect(mocks.resourceCreateMany).toHaveBeenCalledWith({ data: [
      { weeklyLessonId: 'lesson-1', title: 'Slides', url: 'https://example.com/slides', sortOrder: 0 },
      { weeklyLessonId: 'lesson-1', title: 'Video', url: 'https://example.com/video', sortOrder: 1 },
    ] })
  })

  it('rejects invalid links before beginning the transaction', async () => {
    mocks.canEdit.mockReturnValue(true)
    const response = await PATCH(patchRequest({ resources: [{ title: 'Slides', url: 'javascript:alert(1)' }] }), routeContext)
    expect(response.status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('lets a coordinator assign only an eligible active class servant', async () => {
    mocks.canAssign.mockReturnValue(true)
    mocks.canEdit.mockReturnValue(true)
    const response = await PATCH(patchRequest({ ownerId: 'owner-2' }), routeContext)
    expect(response.status).toBe(200)
    expect(mocks.assignmentFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'owner-2',
        classId: 'class-1',
        academicYearId: 'year-1',
        endedAt: null,
      }),
    }))
    expect(mocks.lessonUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { ownerId: 'owner-2', assignedById: 'servant-1' },
    }))

    mocks.assignmentFindFirst.mockResolvedValueOnce(null)
    const invalid = await PATCH(patchRequest({ ownerId: 'outsider-1' }), routeContext)
    expect(invalid.status).toBe(400)
  })
})
