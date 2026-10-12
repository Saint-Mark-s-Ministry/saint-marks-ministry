import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  access: vi.fn(),
  findClass: vi.fn(),
  findClasses: vi.fn(),
  findFirstClass: vi.fn(),
  createClass: vi.fn(),
  updateClass: vi.fn(),
  deleteClass: vi.fn(),
  deletePriestNotes: vi.fn(),
  deleteVisitations: vi.fn(),
  updateVisitations: vi.fn(),
  deleteSessions: vi.fn(),
  updateChildAttendance: vi.fn(),
  deletePlacements: vi.fn(),
  deleteAssignments: vi.fn(),
  deleteRosterImports: vi.fn(),
  transaction: vi.fn(),
  findAcademicYear: vi.fn(),
  findSundaySchoolYear: vi.fn(),
  ensureWeeklyLessons: vi.fn(),
  canCreateClassAtLevel: vi.fn(),
  canViewClass: vi.fn(),
  canCoordinateClass: vi.fn(),
  canServeClass: vi.fn(),
  canTakeServantAttendance: vi.fn(),
  canViewServantAttendance: vi.fn(),
  canDeleteClass: vi.fn(),
  visibleClassFilter: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: mocks.access,
  canViewClass: mocks.canViewClass,
  canCoordinateClass: mocks.canCoordinateClass,
  canServeClass: mocks.canServeClass,
  canTakeServantAttendance: mocks.canTakeServantAttendance,
  canViewServantAttendance: mocks.canViewServantAttendance,
  canDeleteClass: mocks.canDeleteClass,
  canCreateClassAtLevel: mocks.canCreateClassAtLevel,
  visibleClassFilter: mocks.visibleClassFilter,
}))
vi.mock('@/lib/sunday-school-lessons', () => ({
  ensureSundaySchoolWeeklyLessons: mocks.ensureWeeklyLessons,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    academicYear: { findFirst: mocks.findAcademicYear },
    sundaySchoolYear: { findFirst: mocks.findSundaySchoolYear },
    sundaySchoolClass: {
      findUnique: mocks.findClass,
      findFirst: mocks.findFirstClass,
      findMany: mocks.findClasses,
      delete: mocks.deleteClass,
    },
    $transaction: mocks.transaction,
  },
}))

import { DELETE, GET, PATCH } from '@/app/api/sunday-school/classes/[id]/route'
import { GET as GET_CLASSES, POST } from '@/app/api/sunday-school/classes/route'

describe('Sunday School class detail API', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.auth.mockResolvedValue({ id: 'coordinator-1', role: 'SERVANT' })
    mocks.access.mockResolvedValue({
      canRead: true,
      isAdmin: true,
      readOnly: false,
      servantClassIds: new Set(),
      coordinatorClassIds: new Set(),
    })
    mocks.canViewClass.mockReturnValue(true)
    mocks.canCoordinateClass.mockReturnValue(true)
    mocks.canServeClass.mockReturnValue(true)
    mocks.canTakeServantAttendance.mockReturnValue(true)
    mocks.canViewServantAttendance.mockReturnValue(true)
    mocks.canDeleteClass.mockReturnValue(false)
    mocks.canCreateClassAtLevel.mockReturnValue(true)
    mocks.visibleClassFilter.mockReturnValue(undefined)
    mocks.findClasses.mockResolvedValue([])
    mocks.findFirstClass.mockResolvedValue(null)
    mocks.findAcademicYear.mockResolvedValue({ id: 'year-1', name: '2026-2027' })
    mocks.findSundaySchoolYear.mockResolvedValue({ id: 'sunday-year-1', name: '2026-2027' })
    mocks.createClass.mockResolvedValue({
      id: 'class-2',
      name: 'Third Grade Girls',
      level: 'GRADE_3',
      academicYearId: 'year-1',
      sundaySchoolYearId: 'sunday-year-1',
      sectionName: 'Third Grade Girls',
      assignments: [],
      _count: { children: 0, sessions: 0 },
    })
    mocks.updateClass.mockResolvedValue({
      id: 'class-1',
      name: 'Middle School Boys',
      level: 'GRADE_6',
      academicYearId: 'year-1',
      assignments: [],
      _count: { children: 0, sessions: 0 },
    })
    mocks.deleteClass.mockResolvedValue({ id: 'class-1' })
    mocks.deletePriestNotes.mockResolvedValue({ count: 0 })
    mocks.deleteVisitations.mockResolvedValue({ count: 0 })
    mocks.updateVisitations.mockResolvedValue({ count: 0 })
    mocks.deleteSessions.mockResolvedValue({ count: 0 })
    mocks.updateChildAttendance.mockResolvedValue({ count: 0 })
    mocks.deletePlacements.mockResolvedValue({ count: 0 })
    mocks.deleteAssignments.mockResolvedValue({ count: 0 })
    mocks.deleteRosterImports.mockResolvedValue({ count: 0 })
    mocks.transaction.mockImplementation(async callback => callback({
      sundaySchoolClass: {
        create: mocks.createClass,
        update: mocks.updateClass,
        delete: mocks.deleteClass,
      },
      sundaySchoolPriestNote: { deleteMany: mocks.deletePriestNotes },
      sundaySchoolVisitation: {
        deleteMany: mocks.deleteVisitations,
        updateMany: mocks.updateVisitations,
      },
      sundaySchoolSession: { deleteMany: mocks.deleteSessions },
      sundaySchoolChildAttendance: { updateMany: mocks.updateChildAttendance },
      sundaySchoolClassPlacement: { deleteMany: mocks.deletePlacements },
      sundaySchoolServantAssignment: { deleteMany: mocks.deleteAssignments },
      sundaySchoolRosterImport: { deleteMany: mocks.deleteRosterImports },
    }))
    mocks.findClass.mockResolvedValue({
      id: 'class-1',
      name: 'Middle School',
      level: 'GRADE_3',
      academicYearId: 'year-1',
      sundaySchoolYearId: 'sunday-year-1',
      sectionName: 'General',
      assignments: [],
      children: [],
      sessions: [],
      weeklyLessons: [],
    })
  })

  it('returns only active servant assignments after one is removed', async () => {
    const response = await GET(
      new Request('http://localhost/api/sunday-school/classes/class-1'),
      { params: Promise.resolve({ id: 'class-1' }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.findClass).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'class-1' },
      include: expect.objectContaining({
        assignments: expect.objectContaining({ where: { endedAt: null } }),
      }),
    }))
  })

  it('requests each session\'s per-child attendance statuses, not just the server count (SMM-53)', async () => {
    await GET(
      new Request('http://localhost/api/sunday-school/classes/class-1'),
      { params: Promise.resolve({ id: 'class-1' }) }
    )

    expect(mocks.findClass).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        sessions: expect.objectContaining({
          include: expect.objectContaining({
            _count: { select: { attendance: true } },
            attendance: { select: { status: true } },
          }),
        }),
      }),
    }))
  })

  it('trims and updates a class name for a coordinator', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/sunday-school/classes/class-1', {
        method: 'PATCH',
        body: JSON.stringify({ name: '  Middle School Boys  ' }),
      }),
      { params: Promise.resolve({ id: 'class-1' }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.updateClass).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'class-1' },
      data: { name: 'Middle School Boys' },
    }))
  })

  it('keeps an automatically generated section key aligned after a rename', async () => {
    mocks.findClass.mockResolvedValue({
      id: 'class-1',
      name: 'Third Grade Girls',
      level: 'GRADE_3',
      academicYearId: 'year-1',
      sundaySchoolYearId: 'sunday-year-1',
      sectionName: 'Third Grade Girls',
    })
    mocks.findFirstClass.mockResolvedValue(null)

    const response = await PATCH(
      new Request('http://localhost/api/sunday-school/classes/class-1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Third Grade A' }),
      }),
      { params: Promise.resolve({ id: 'class-1' }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.updateClass).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        name: 'Third Grade A',
        sectionName: 'Third Grade A',
      },
    }))
  })

  it('creates another class in a grade using its name as the section key', async () => {
    mocks.findFirstClass
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'class-1' })
      .mockResolvedValueOnce(null)

    const response = await POST(
      new Request('http://localhost/api/sunday-school/classes', {
        method: 'POST',
        body: JSON.stringify({ name: 'Third Grade Girls', level: 'GRADE_3' }),
      })
    )

    expect(response.status).toBe(201)
    expect(mocks.createClass).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: 'Third Grade Girls',
        level: 'GRADE_3',
        sectionName: 'Third Grade Girls',
      }),
    }))
  })

  it('defaults the class list to the active academic year', async () => {
    const response = await GET_CLASSES(
      new Request('http://localhost/api/sunday-school/classes?isActive=true')
    )

    expect(response.status).toBe(200)
    expect(mocks.findAcademicYear).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true },
    })
    expect(mocks.findClasses).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        academicYearId: 'year-1',
        isActive: true,
      },
    }))
  })

  it('refuses to create classes when the academic and Sunday School years differ', async () => {
    mocks.findAcademicYear.mockResolvedValue({ id: 'old-year', name: '2025-2026' })

    const response = await POST(
      new Request('http://localhost/api/sunday-school/classes', {
        method: 'POST',
        body: JSON.stringify({
          name: '6th Grade',
          level: 'GRADE_6',
          academicYearId: 'old-year',
        }),
      })
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'The academic year and open Sunday School year must match',
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('returns a clear conflict when another class already uses the name', async () => {
    mocks.findFirstClass.mockResolvedValue({ id: 'class-2' })

    const response = await PATCH(
      new Request('http://localhost/api/sunday-school/classes/class-1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Existing Class' }),
      }),
      { params: Promise.resolve({ id: 'class-1' }) }
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'A class with this name already exists for that academic year',
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('permanently deletes a class and its class-specific history', async () => {
    mocks.canDeleteClass.mockReturnValue(true)

    const response = await DELETE(
      new Request('http://localhost/api/sunday-school/classes/class-1', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: 'class-1' }) }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true, action: 'deleted' })
    expect(mocks.deletePriestNotes).toHaveBeenCalledWith({
      where: { visitation: { classId: 'class-1' } },
    })
    expect(mocks.deleteSessions).toHaveBeenCalledWith({ where: { classId: 'class-1' } })
    expect(mocks.deletePlacements).toHaveBeenCalledWith({ where: { classId: 'class-1' } })
    expect(mocks.deleteAssignments).toHaveBeenCalledWith({ where: { classId: 'class-1' } })
    expect(mocks.deleteRosterImports).toHaveBeenCalledWith({ where: { classId: 'class-1' } })
    expect(mocks.deleteClass).toHaveBeenCalledWith({ where: { id: 'class-1' } })
  })

  it('does not delete a class without age-group delete authority', async () => {
    mocks.canDeleteClass.mockReturnValue(false)

    const response = await DELETE(
      new Request('http://localhost/api/sunday-school/classes/class-1', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: 'class-1' }) }
    )

    expect(response.status).toBe(403)
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.deleteClass).not.toHaveBeenCalled()
  })
})
