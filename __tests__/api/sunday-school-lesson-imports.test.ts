import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getAccess: vi.fn(),
  canServe: vi.fn(),
  findClass: vi.fn(),
  findLessons: vi.fn(),
  findAssignments: vi.fn(),
  transaction: vi.fn(),
  upsertLesson: vi.fn(),
  deleteResources: vi.fn(),
  createResources: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: mocks.getAccess,
  canServeClass: mocks.canServe,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    sundaySchoolClass: { findUnique: mocks.findClass },
    sundaySchoolWeeklyLesson: { findMany: mocks.findLessons },
    sundaySchoolServantAssignment: { findMany: mocks.findAssignments },
    $transaction: mocks.transaction,
  },
}))

import { POST } from '@/app/api/sunday-school/lesson-imports/route'

function request(rows: Array<Record<string, unknown>>) {
  return new Request('http://localhost/api/sunday-school/lesson-imports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classId: 'class-1', rows }),
  })
}

describe('Sunday School lesson CSV import API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'servant-1', role: 'SERVANT' })
    mocks.getAccess.mockResolvedValue({ canRead: true })
    mocks.canServe.mockReturnValue(true)
    mocks.findClass.mockResolvedValue({
      id: 'class-1',
      name: 'Grade 4',
      level: 'GRADE_4',
      academicYearId: 'year-1',
      isActive: true,
      academicYear: {
        startDate: new Date('2024-09-01T00:00:00.000Z'),
        endDate: new Date('2025-06-30T00:00:00.000Z'),
      },
      sundaySchoolYear: {
        startDate: new Date('2026-09-11T00:00:00.000Z'),
        endDate: new Date('2027-09-10T00:00:00.000Z'),
      },
    })
    mocks.findLessons.mockResolvedValue([{
      id: 'lesson-existing',
      sundayDate: new Date('2026-09-27T00:00:00.000Z'),
    }])
    mocks.findAssignments.mockResolvedValue([{
      user: { id: 'servant-1', name: 'Jane Servant', email: 'jane@example.com' },
    }])
    mocks.upsertLesson.mockResolvedValue({ id: 'lesson-existing' })
    mocks.transaction.mockImplementation(async callback => callback({
      sundaySchoolWeeklyLesson: { upsert: mocks.upsertLesson },
      sundaySchoolWeeklyLessonResource: {
        deleteMany: mocks.deleteResources,
        createMany: mocks.createResources,
      },
    }))
  })

  it('updates matching lesson dates and replaces links atomically', async () => {
    const response = await POST(request([{
      rowNumber: 2,
      lessonDate: '2026-09-27',
      title: 'The Good Samaritan',
      resources: [{ title: 'Slides', url: 'https://example.com/slides' }],
      replaceResources: true,
    }]))
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toMatchObject({ totalRows: 1, updatedRows: 1, createdRows: 0 })
    expect(mocks.upsertLesson).toHaveBeenCalledWith({
      where: {
        classId_sundayDate: {
          classId: 'class-1',
          sundayDate: new Date('2026-09-27T00:00:00.000Z'),
        },
      },
      create: {
        classId: 'class-1',
        sundayDate: new Date('2026-09-27T00:00:00.000Z'),
        title: 'The Good Samaritan',
      },
      update: { title: 'The Good Samaritan' },
      select: { id: true },
    })
    expect(mocks.deleteResources).toHaveBeenCalledWith({ where: { weeklyLessonId: 'lesson-existing' } })
    expect(mocks.createResources).toHaveBeenCalledWith({ data: [{
      weeklyLessonId: 'lesson-existing',
      title: 'Slides',
      url: 'https://example.com/slides',
      sortOrder: 0,
    }] })
  })

  it('assigns by servant name when the spreadsheet has no email', async () => {
    const response = await POST(request([{
      rowNumber: 2,
      lessonDate: '2026-09-27',
      ownerName: '  jane   servant ',
      ownerEmail: null,
      title: null,
      resources: [],
      replaceResources: false,
    }]))
    const body = await response.json()

    expect(body).toMatchObject({ assignedRows: 1, unmatchedRows: 0, warnings: [] })
    expect(mocks.upsertLesson).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        ownerId: 'servant-1',
        assignedById: 'servant-1',
        title: null,
      }),
      update: {
        ownerId: 'servant-1',
        assignedById: 'servant-1',
      },
    }))
  })

  it('falls back to the servant name when the supplied email does not match', async () => {
    const response = await POST(request([{
      rowNumber: 2,
      lessonDate: '2026-09-27',
      ownerName: 'Jane Servant',
      ownerEmail: 'old-address@example.com',
      title: null,
      resources: [],
      replaceResources: false,
    }]))

    expect(await response.json()).toMatchObject({ assignedRows: 1, unmatchedRows: 0 })
  })

  it('imports unmatched rows without overwriting the current lesson owner', async () => {
    const response = await POST(request([{
      rowNumber: 2,
      lessonDate: '2026-09-27',
      ownerName: 'Unknown Servant',
      ownerEmail: null,
      title: null,
      resources: [],
      replaceResources: false,
    }]))
    const body = await response.json()

    expect(body).toMatchObject({
      assignedRows: 0,
      unmatchedRows: 1,
      warnings: [{ rowNumber: 2 }],
    })
    expect(mocks.upsertLesson).toHaveBeenCalledWith(expect.objectContaining({ update: {} }))
  })

  it('preserves existing links for a title-only spreadsheet', async () => {
    await POST(request([{
      rowNumber: 2,
      lessonDate: '2026-09-27',
      title: 'The Good Samaritan',
      resources: [],
      replaceResources: false,
    }]))

    expect(mocks.deleteResources).not.toHaveBeenCalled()
    expect(mocks.createResources).not.toHaveBeenCalled()
  })

  it('rejects duplicate dates before changing lessons', async () => {
    const response = await POST(request([
      { rowNumber: 2, lessonDate: '2026-09-27', title: 'One', resources: [], replaceResources: false },
      { rowNumber: 3, lessonDate: '2026-09-27', title: 'Two', resources: [], replaceResources: false },
    ]))

    expect(response.status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('requires an active class assignment', async () => {
    mocks.canServe.mockReturnValue(false)

    const response = await POST(request([{
      rowNumber: 2,
      lessonDate: '2026-09-27',
      title: 'The Good Samaritan',
      resources: [],
      replaceResources: false,
    }]))

    expect(response.status).toBe(403)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
