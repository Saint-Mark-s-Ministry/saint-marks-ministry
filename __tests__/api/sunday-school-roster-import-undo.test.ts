import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getAccess: vi.fn(),
  canServeClass: vi.fn(),
  findImport: vi.fn(),
  transaction: vi.fn(),
  deletePlacements: vi.fn(),
  deleteEnrollment: vi.fn(),
  deleteChild: vi.fn(),
  countRows: vi.fn(),
  updateImport: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: mocks.getAccess,
  canServeClass: mocks.canServeClass,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    sundaySchoolRosterImport: { findUnique: mocks.findImport },
    $transaction: mocks.transaction,
  },
}))

import { DELETE } from '@/app/api/sunday-school/roster-imports/[id]/route'

const completedAt = new Date('2026-09-26T14:00:00.000Z')

function importedChild(overrides: Record<string, unknown> = {}) {
  return {
    id: 'child-1',
    firstName: 'Jane',
    lastName: 'Doe',
    familyId: null,
    userId: null,
    classId: 'class-1',
    updatedAt: new Date('2026-09-26T13:59:59.000Z'),
    registrationRequest: null,
    enrollments: [{ id: 'enrollment-1' }],
    _count: {
      attendance: 0,
      visitations: 0,
      phoneCalls: 0,
      guardians: 0,
      rosterImportRows: 1,
    },
    ...overrides,
  }
}

function rosterImport(child = importedChild()) {
  return {
    id: 'import-1',
    classId: 'class-1',
    status: 'COMMITTED',
    summary: { createdRows: 1 },
    completedAt,
    class: { academicYearId: 'academic-year-1' },
    rows: [{
      id: 'row-1',
      rowNumber: 2,
      childId: 'child-1',
      enrollmentId: 'enrollment-1',
      child,
    }],
  }
}

const transactionClient = {
  sundaySchoolClassPlacement: { deleteMany: mocks.deletePlacements },
  sundaySchoolEnrollment: { delete: mocks.deleteEnrollment },
  sundaySchoolChild: { delete: mocks.deleteChild },
  sundaySchoolRosterImportRow: { count: mocks.countRows },
  sundaySchoolRosterImport: { update: mocks.updateImport },
}

describe('Sunday School roster CSV import undo API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'servant-1', role: 'SERVANT' })
    mocks.getAccess.mockResolvedValue({ canRead: true })
    mocks.canServeClass.mockReturnValue(true)
    mocks.findImport.mockResolvedValue(rosterImport())
    mocks.countRows.mockResolvedValue(0)
    mocks.transaction.mockImplementation(async callback => callback(transactionClient))
  })

  it('deletes every record created for a safe imported student', async () => {
    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'import-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ removedRows: 1, protectedRows: 0 })
    expect(mocks.deletePlacements).toHaveBeenCalledWith({
      where: { enrollmentId: 'enrollment-1' },
    })
    expect(mocks.deleteEnrollment).toHaveBeenCalledWith({
      where: { id: 'enrollment-1' },
    })
    expect(mocks.deleteChild).toHaveBeenCalledWith({
      where: { id: 'child-1' },
    })
    expect(mocks.updateImport).toHaveBeenCalledWith({
      where: { id: 'import-1' },
      data: {
        summary: expect.objectContaining({
          rollback: expect.objectContaining({
            removedRows: 1,
            protectedRows: 0,
            rolledBackAt: expect.any(String),
          }),
        }),
      },
    })
  })

  it('protects an imported student after attendance has been recorded', async () => {
    mocks.findImport.mockResolvedValue(rosterImport(importedChild({
      _count: {
        attendance: 1,
        visitations: 0,
        phoneCalls: 0,
        guardians: 0,
        rosterImportRows: 1,
      },
    })))
    mocks.countRows.mockResolvedValue(1)

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'import-1' }),
    })
    const body = await response.json()

    expect(body).toMatchObject({
      removedRows: 0,
      protectedRows: 1,
      protectedStudents: [{ rowNumber: 2, name: 'Jane Doe' }],
    })
    expect(mocks.deleteChild).not.toHaveBeenCalled()
  })

  it('keeps an imported child once a follow-up call has been logged', async () => {
    mocks.findImport.mockResolvedValue(rosterImport(importedChild({
      _count: {
        attendance: 0,
        visitations: 0,
        phoneCalls: 1,
        guardians: 0,
        rosterImportRows: 1,
      },
    })))
    mocks.countRows.mockResolvedValue(1)

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'import-1' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ removedRows: 0, protectedRows: 1 })
    expect(mocks.deleteChild).not.toHaveBeenCalled()
  })

  it('does not allow a servant to undo another class roster', async () => {
    mocks.canServeClass.mockReturnValue(false)

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'import-1' }),
    })

    expect(response.status).toBe(403)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
