// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getSundaySchoolAccess: vi.fn(),
  canCoordinateClass: vi.fn(),
  classFindUnique: vi.fn(),
  ensure: vi.fn(),
  assignmentFindMany: vi.fn(),
  lessonFindMany: vi.fn(),
  lessonUpdate: vi.fn(),
  lessonCount: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: mocks.getSundaySchoolAccess,
  canCoordinateClass: mocks.canCoordinateClass,
}))
vi.mock('@/lib/sunday-school-lessons', () => ({ ensureSundaySchoolWeeklyLessons: mocks.ensure }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    sundaySchoolClass: { findUnique: mocks.classFindUnique },
    sundaySchoolServantAssignment: { findMany: mocks.assignmentFindMany },
    sundaySchoolWeeklyLesson: { findMany: mocks.lessonFindMany, update: mocks.lessonUpdate, count: mocks.lessonCount },
    $transaction: mocks.transaction,
  },
}))

import { GET, POST } from '@/app/api/sunday-school/lessons/schedule/route'

function request(body: unknown) {
  return new Request('http://localhost/api/sunday-school/lessons/schedule', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function getRequest(classId?: string) {
  const url = classId
    ? `http://localhost/api/sunday-school/lessons/schedule?classId=${classId}`
    : 'http://localhost/api/sunday-school/lessons/schedule'
  return new Request(url)
}

describe('POST /api/sunday-school/lessons/schedule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'coordinator-1', role: 'SERVANT' })
    mocks.classFindUnique.mockResolvedValue({ id: 'class-1', academicYearId: 'year-1' })
    mocks.getSundaySchoolAccess.mockResolvedValue({})
    mocks.canCoordinateClass.mockReturnValue(true)
    mocks.ensure.mockResolvedValue({ classes: 1, attempted: 0, created: 0 })
    mocks.assignmentFindMany.mockResolvedValue([
      { user: { id: 'servant-a', name: 'Alice' } },
      { user: { id: 'servant-b', name: 'Bob' } },
    ])
    mocks.lessonFindMany.mockResolvedValue([
      { id: 'lesson-1', sundayDate: new Date('2026-10-18T00:00:00.000Z') },
      { id: 'lesson-2', sundayDate: new Date('2026-10-25T00:00:00.000Z') },
      { id: 'lesson-3', sundayDate: new Date('2026-11-01T00:00:00.000Z') },
    ])
    mocks.transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops))
    mocks.lessonCount.mockResolvedValue(3)
  })

  describe('GET preview', () => {
    it('rejects a non-coordinator, and a missing classId', async () => {
      expect((await GET(getRequest())).status).toBe(400)
      mocks.canCoordinateClass.mockReturnValue(false)
      expect((await GET(getRequest('class-1'))).status).toBe(403)
    })

    it("returns the class's eligible servants and empty-week count, deduplicated", async () => {
      mocks.assignmentFindMany.mockResolvedValue([
        { user: { id: 'servant-a', name: 'Alice', profileImageUrl: null } },
        { user: { id: 'servant-a', name: 'Alice', profileImageUrl: null } },
        { user: { id: 'servant-b', name: 'Bob', profileImageUrl: null } },
      ])

      const response = await GET(getRequest('class-1'))
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.servants).toEqual([
        { id: 'servant-a', name: 'Alice', profileImageUrl: null },
        { id: 'servant-b', name: 'Bob', profileImageUrl: null },
      ])
      expect(body.emptyWeeksAvailable).toBe(3)
    })
  })

  it('rejects a non-coordinator, scheduling nothing', async () => {
    mocks.canCoordinateClass.mockReturnValue(false)
    const response = await POST(request({ classId: 'class-1', mode: 'fill-year' }))
    expect(response.status).toBe(403)
    expect(mocks.lessonFindMany).not.toHaveBeenCalled()
  })

  it('rejects a missing class, an invalid mode, or a non-array excludedServantIds', async () => {
    expect((await POST(request({ mode: 'fill-year' }))).status).toBe(400)
    expect((await POST(request({ classId: 'class-1', mode: 'every-week' }))).status).toBe(400)
    expect((await POST(request({ classId: 'class-1', mode: 'fill-year', excludedServantIds: 'servant-a' }))).status).toBe(400)
  })

  it('returns 404 for a class that does not exist', async () => {
    mocks.classFindUnique.mockResolvedValue(null)
    expect((await POST(request({ classId: 'nope', mode: 'fill-year' }))).status).toBe(404)
  })

  it('"one-each" assigns exactly one servant per earliest date and stops (happy path)', async () => {
    const response = await POST(request({ classId: 'class-1', mode: 'one-each' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.assigned).toEqual([
      { lessonId: 'lesson-1', sundayDate: '2026-10-18T00:00:00.000Z', servantId: 'servant-a', servantName: 'Alice' },
      { lessonId: 'lesson-2', sundayDate: '2026-10-25T00:00:00.000Z', servantId: 'servant-b', servantName: 'Bob' },
    ])
    expect(mocks.lessonUpdate).toHaveBeenCalledTimes(2)
    expect(mocks.lessonUpdate).toHaveBeenCalledWith({
      where: { id: 'lesson-1' },
      data: { ownerId: 'servant-a', assignedById: 'coordinator-1' },
    })
  })

  it('"fill-year" assigns every empty week, cycling the pool', async () => {
    const response = await POST(request({ classId: 'class-1', mode: 'fill-year' }))
    const body = await response.json()
    expect(body.assigned.map((a: { servantId: string }) => a.servantId)).toEqual(['servant-a', 'servant-b', 'servant-a'])
  })

  it('drops an excluded servant from the pool before assigning (highest-risk path)', async () => {
    const response = await POST(request({ classId: 'class-1', mode: 'fill-year', excludedServantIds: ['servant-b'] }))
    const body = await response.json()
    expect(body.assigned.every((a: { servantId: string }) => a.servantId === 'servant-a')).toBe(true)
    expect(body.eligibleServants).toBe(1)
  })

  it('refuses to schedule when every assigned servant has been excluded, writing nothing', async () => {
    const response = await POST(request({
      classId: 'class-1', mode: 'fill-year', excludedServantIds: ['servant-a', 'servant-b'],
    }))
    expect(response.status).toBe(400)
    expect(mocks.lessonUpdate).not.toHaveBeenCalled()
  })

  it('never touches an already-assigned week — only ownerId: null lessons are even queried', async () => {
    await POST(request({ classId: 'class-1', mode: 'fill-year' }))
    expect(mocks.lessonFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ ownerId: null }),
    }))
  })
})
