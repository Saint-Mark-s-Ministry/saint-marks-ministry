import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getAccess: vi.fn(),
  canServeClass: vi.fn(),
  findClass: vi.fn(),
  findImport: vi.fn(),
  findChildren: vi.fn(),
  transaction: vi.fn(),
  createImport: vi.fn(),
  updateImport: vi.fn(),
  createImportRow: vi.fn(),
  createChild: vi.fn(),
  updateChild: vi.fn(),
  createEnrollment: vi.fn(),
  updateEnrollment: vi.fn(),
  createPlacement: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: mocks.getAccess,
  canServeClass: mocks.canServeClass,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    sundaySchoolClass: { findUnique: mocks.findClass },
    sundaySchoolRosterImport: { findUnique: mocks.findImport },
    sundaySchoolChild: { findMany: mocks.findChildren },
    $transaction: mocks.transaction,
  },
}))

import { POST } from '@/app/api/sunday-school/roster-imports/route'

const targetClass = {
  id: 'class-1',
  name: 'Grade 3',
  level: 'GRADE_3',
  academicYearId: 'academic-year-1',
  sundaySchoolYearId: 'sunday-school-year-1',
  isActive: true,
}

const transactionClient = {
  sundaySchoolRosterImport: {
    create: mocks.createImport,
    update: mocks.updateImport,
  },
  sundaySchoolRosterImportRow: { create: mocks.createImportRow },
  sundaySchoolChild: {
    create: mocks.createChild,
    update: mocks.updateChild,
  },
  sundaySchoolEnrollment: {
    create: mocks.createEnrollment,
    update: mocks.updateEnrollment,
  },
  sundaySchoolClassPlacement: { create: mocks.createPlacement },
}

function request(rows: Array<Record<string, unknown>>) {
  return new NextRequest('http://localhost/api/sunday-school/roster-imports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      classId: 'class-1',
      fileName: 'roster.csv',
      idempotencyKey: 'import-1',
      rows,
    }),
  })
}

describe('Sunday School roster CSV import API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'servant-1', role: 'SERVANT' })
    mocks.getAccess.mockResolvedValue({ canRead: true })
    mocks.canServeClass.mockReturnValue(true)
    mocks.findClass.mockResolvedValue(targetClass)
    mocks.findImport.mockResolvedValue(null)
    mocks.findChildren.mockResolvedValue([])
    mocks.createImport.mockResolvedValue({ id: 'import-1' })
    mocks.createChild.mockResolvedValue({ id: 'child-1' })
    mocks.createEnrollment.mockResolvedValue({ id: 'enrollment-1' })
    mocks.updateEnrollment.mockResolvedValue({ id: 'enrollment-existing' })
    mocks.createPlacement.mockResolvedValue({ id: 'placement-1' })
    mocks.createImportRow.mockResolvedValue({ id: 'row-1' })
    mocks.updateImport.mockImplementation(async ({ data }) => ({
      id: 'import-1',
      totalRows: 1,
      ...data,
    }))
    mocks.transaction.mockImplementation(async callback => callback(transactionClient))
  })

  it('creates the child, enrollment, placement, and audit row in one import', async () => {
    const response = await POST(request([{
      rowNumber: 2,
      firstName: 'Jane',
      lastName: 'Doe',
      gender: 'FEMALE',
      birthDate: '2015-04-12',
      guardianName: 'John Doe',
      guardianPhone: '555-1234',
      guardianEmail: 'parent@example.com',
      notes: null,
    }]))
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      totalRows: 1,
      createdRows: 1,
      matchedRows: 0,
      failedRows: 0,
    })
    expect(mocks.getAccess).toHaveBeenCalledWith(
      { id: 'servant-1', role: 'SERVANT' },
      'academic-year-1'
    )
    expect(mocks.createChild).toHaveBeenCalledWith({
      data: expect.objectContaining({
        firstName: 'Jane',
        lastName: 'Doe',
        level: 'GRADE_3',
        classId: 'class-1',
        gender: 'FEMALE',
        guardianEmail: 'parent@example.com',
      }),
    })
    expect(mocks.createEnrollment).toHaveBeenCalledWith({
      data: {
        childId: 'child-1',
        sundaySchoolYearId: 'sunday-school-year-1',
        level: 'GRADE_3',
      },
    })
    expect(mocks.createPlacement).toHaveBeenCalledWith({
      data: expect.objectContaining({
        enrollmentId: 'enrollment-1',
        classId: 'class-1',
        movedById: 'servant-1',
      }),
    })
    expect(mocks.createImportRow).toHaveBeenCalledWith({
      data: expect.objectContaining({
        importId: 'import-1',
        rowNumber: 2,
        outcome: 'CREATED',
        childId: 'child-1',
        enrollmentId: 'enrollment-1',
      }),
    })
  })

  it('matches an existing child instead of creating a duplicate', async () => {
    mocks.findChildren.mockResolvedValue([{
      id: 'child-existing',
      firstName: 'Jane',
      lastName: 'Doe',
      birthDate: null,
      classId: 'class-1',
      class: { name: 'Grade 3' },
      enrollments: [{
        id: 'enrollment-existing',
        level: 'GRADE_3',
        status: 'ACTIVE',
        placements: [{ id: 'placement-existing', classId: 'class-1' }],
      }],
    }])

    const response = await POST(request([{
      rowNumber: 2,
      firstName: 'Jane',
      lastName: 'Doe',
      birthDate: '2015-04-12',
    }]))
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toMatchObject({ createdRows: 0, matchedRows: 1 })
    expect(mocks.createChild).not.toHaveBeenCalled()
    expect(mocks.updateChild).toHaveBeenCalledWith({
      where: { id: 'child-existing' },
      data: expect.objectContaining({ classId: 'class-1', level: 'GRADE_3' }),
    })
    expect(mocks.updateEnrollment).toHaveBeenCalledWith({
      where: { id: 'enrollment-existing' },
      data: { status: 'ACTIVE', endedAt: null },
    })
  })

  it('rejects imports from users who cannot manage the selected class', async () => {
    mocks.canServeClass.mockReturnValue(false)

    const response = await POST(request([{
      rowNumber: 2,
      firstName: 'Jane',
      lastName: 'Doe',
    }]))

    expect(response.status).toBe(403)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('returns a committed import on a safe retry without creating rows twice', async () => {
    mocks.findImport.mockResolvedValue({
      id: 'import-existing',
      requestHash: 'different-until-replaced',
      status: 'COMMITTED',
      totalRows: 1,
      createdRows: 1,
      matchedRows: 0,
      skippedRows: 0,
      failedRows: 0,
      rows: [{ rowNumber: 2, outcome: 'CREATED', message: null }],
    })

    const importRequest = request([{
      rowNumber: 2,
      firstName: 'Jane',
      lastName: 'Doe',
    }])

    // The request hash is intentionally opaque; capture it from the first
    // conflict and then verify the successful replay through a fresh import.
    const firstResponse = await POST(importRequest)
    expect(firstResponse.status).toBe(409)
    mocks.findImport.mockResolvedValue(null)
    await POST(request([{ rowNumber: 2, firstName: 'Jane', lastName: 'Doe' }]))
    const requestHash = mocks.createImport.mock.calls[0][0].data.requestHash
    mocks.findImport.mockResolvedValue({
      id: 'import-existing',
      requestHash,
      status: 'COMMITTED',
      totalRows: 1,
      createdRows: 1,
      matchedRows: 0,
      skippedRows: 0,
      failedRows: 0,
      rows: [{ rowNumber: 2, outcome: 'CREATED', message: null }],
    })
    mocks.transaction.mockClear()

    const retryResponse = await POST(request([{
      rowNumber: 2,
      firstName: 'Jane',
      lastName: 'Doe',
    }]))

    expect(retryResponse.status).toBe(200)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('records invalid rows without creating children', async () => {
    const response = await POST(request([{
      rowNumber: 2,
      firstName: 'Jane',
      lastName: '',
    }]))
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toMatchObject({ createdRows: 0, failedRows: 1 })
    expect(mocks.createChild).not.toHaveBeenCalled()
    expect(mocks.createImportRow).toHaveBeenCalledWith({
      data: expect.objectContaining({
        rowNumber: 2,
        outcome: 'FAILED',
        message: 'Last name is required',
      }),
    })
  })
})
