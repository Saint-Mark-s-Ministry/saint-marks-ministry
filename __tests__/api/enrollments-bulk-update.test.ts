import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { UserRole } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  transaction: vi.fn(),
  findEnrollments: vi.fn(),
  findActiveYear: vi.fn(),
  updateEnrollments: vi.fn(),
  backfillAttendance: vi.fn(),
  deleteAnnualMentorInformation: vi.fn(),
  enrollmentStatusUpdate: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }))
vi.mock('@/lib/api-utils', () => ({
  backfillAttendanceForStudents: mocks.backfillAttendance,
  enrollmentStatusUpdate: mocks.enrollmentStatusUpdate,
}))

import { POST } from '@/app/api/enrollments/bulk-update/route'

const transactionClient = {
  studentEnrollment: {
    findMany: mocks.findEnrollments,
    updateMany: mocks.updateEnrollments,
  },
  academicYear: { findFirst: mocks.findActiveYear },
  annualMentorInformation: { deleteMany: mocks.deleteAnnualMentorInformation },
}

function request(updates: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/enrollments/bulk-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enrollmentIds: ['enrollment-1', 'enrollment-2'], updates }),
  })
}

describe('bulk enrollment promotion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getServerSession.mockResolvedValue({
      user: { id: 'admin-1', role: UserRole.SUPER_ADMIN },
    })
    mocks.findEnrollments.mockResolvedValue([
      { id: 'enrollment-1', studentId: 'student-1', yearLevel: 'YEAR_1', isActive: true },
      { id: 'enrollment-2', studentId: 'student-2', yearLevel: 'YEAR_1', isActive: true },
    ])
    mocks.findActiveYear.mockResolvedValue({ id: 'year-2026' })
    mocks.updateEnrollments.mockResolvedValue({ count: 2 })
    mocks.backfillAttendance.mockResolvedValue(5)
    mocks.deleteAnnualMentorInformation.mockResolvedValue({ count: 0 })
    mocks.transaction.mockImplementation(
      async (callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient)
    )
  })

  it('preserves history and backfills missing active-year attendance when promoting', async () => {
    const response = await POST(request({ yearLevel: 'YEAR_2' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: 'Successfully updated 2 enrollment(s)',
      count: 2,
      promotion: {
        promotedCount: 2,
        historicalAttendancePreserved: true,
        activeAcademicYearId: 'year-2026',
        attendanceRecordsCreated: 5,
      },
    })
    expect(mocks.updateEnrollments).toHaveBeenCalledWith({
      where: { id: { in: ['enrollment-1', 'enrollment-2'] } },
      data: { yearLevel: 'YEAR_2' },
    })
    expect(mocks.backfillAttendance).toHaveBeenCalledWith(
      ['student-1', 'student-2'],
      'year-2026',
      transactionClient
    )
    expect(mocks.deleteAnnualMentorInformation).toHaveBeenCalledWith({
      where: {
        studentId: { in: ['student-1', 'student-2'] },
        academicYearId: 'year-2026',
      },
    })
  })

  it.each(['YEAR_1', 'YEAR_2'])('rejects a mixed batch containing an async student for %s', async yearLevel => {
    mocks.findEnrollments.mockResolvedValue([
      { id: 'enrollment-1', studentId: 'student-1', yearLevel: 'YEAR_1', isActive: true, isAsyncStudent: false },
      { id: 'enrollment-2', studentId: 'student-2', yearLevel: null, isActive: true, isAsyncStudent: true },
    ])
    const response = await POST(request({ yearLevel }))
    expect(response.status).toBe(400)
    expect(mocks.updateEnrollments).not.toHaveBeenCalled()
    expect(mocks.backfillAttendance).not.toHaveBeenCalled()
  })

  it('does not promote students without an active academic year', async () => {
    mocks.findActiveYear.mockResolvedValue(null)

    const response = await POST(request({ yearLevel: 'YEAR_2' }))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'No active academic year is configured for Year 2 promotion',
    })
    expect(mocks.updateEnrollments).not.toHaveBeenCalled()
    expect(mocks.backfillAttendance).not.toHaveBeenCalled()
  })

  it('keeps an already-promoted enrollment idempotent', async () => {
    mocks.findEnrollments.mockResolvedValue([
      { id: 'enrollment-1', studentId: 'student-1', yearLevel: 'YEAR_2', isActive: true },
    ])
    mocks.updateEnrollments.mockResolvedValue({ count: 1 })

    const response = await POST(request({ yearLevel: 'YEAR_2' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      promotion: {
        promotedCount: 0,
        historicalAttendancePreserved: true,
        activeAcademicYearId: null,
        attendanceRecordsCreated: 0,
      },
    })
    expect(mocks.findActiveYear).not.toHaveBeenCalled()
    expect(mocks.backfillAttendance).not.toHaveBeenCalled()
  })

  it('does not create attendance for inactive enrollments', async () => {
    mocks.findEnrollments.mockResolvedValue([
      { id: 'enrollment-1', studentId: 'student-1', yearLevel: 'YEAR_1', isActive: false },
    ])
    mocks.updateEnrollments.mockResolvedValue({ count: 1 })

    const response = await POST(request({ yearLevel: 'YEAR_2' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      promotion: { promotedCount: 0, attendanceRecordsCreated: 0 },
    })
    expect(mocks.findActiveYear).not.toHaveBeenCalled()
    expect(mocks.backfillAttendance).not.toHaveBeenCalled()
  })
})
