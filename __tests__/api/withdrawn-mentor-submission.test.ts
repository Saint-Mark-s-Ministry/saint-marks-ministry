import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), enrollment: vi.fn(), annual: vi.fn(), application: vi.fn(),
  updateEnrollment: vi.fn(), upsertAnnual: vi.fn(), review: vi.fn(),
  clear: vi.fn(), notify: vi.fn(), put: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/authorization', () => ({
  getAuthorizationContext: async () => ({ roleTags: new Set(['SERVANTS_PREP_SERVANT']) }),
  canWriteBusinessData: () => true,
}))
vi.mock('@vercel/blob', () => ({ put: mocks.put }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  academicYear: { findFirst: async () => ({ id: 'year-1', name: '2026-2027' }) },
  studentEnrollment: { findUnique: mocks.enrollment },
  annualMentorInformation: { findUnique: mocks.annual },
  registrationSubmission: { findFirst: mocks.application },
  $transaction: async (callback: (tx: unknown) => unknown) => callback({
    studentEnrollment: { updateMany: mocks.updateEnrollment, update: mocks.updateEnrollment },
    annualMentorInformation: { upsert: mocks.upsertAnnual, updateMany: mocks.review },
    user: { findMany: async () => [{ id: 'staff-1' }] },
    notification: { deleteMany: mocks.clear, createMany: mocks.notify },
  }),
} }))

// Use the real eligibility lookup in all three routes, including its DB select.
import { GET, PATCH } from '@/app/api/registration/application/route'
import { POST as upload } from '@/app/api/registration/application/upload/route'
import { POST as review } from '@/app/api/students/[id]/mentor-information/review/route'
import { buildStudentMapFromEnrollments } from '@/lib/utils'

const enrollment = {
  id: 'enrollment-1', isActive: false, status: 'WITHDRAWN', yearLevel: 'YEAR_2',
  isAsyncStudent: false, mentorName: null, mentorPhone: null,
  approvalFormUrl: null, approvalFormFilename: null,
}
const updatedAt = new Date('2026-10-30T12:00:00Z')
const information = {
  id: 'info-1', updatedAt, reviewedAt: null,
  mentorName: 'Late Mentor', mentorPhone: '555-0100', mentorEmail: 'mentor@example.com',
}

describe('withdrawn Year 2 mentor submission and verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ id: 'student-1', name: 'Student' })
    mocks.enrollment.mockImplementation(async ({ select }) => Object.fromEntries(
      Object.entries(enrollment).filter(([key]) => select[key]),
    ))
    mocks.application.mockResolvedValue(null)
    mocks.annual.mockResolvedValue(null)
    mocks.upsertAnnual.mockResolvedValue(information)
    mocks.review.mockResolvedValue({ count: 1 })
    mocks.updateEnrollment.mockResolvedValue({ count: 1 })
    mocks.put.mockResolvedValue({ url: 'https://example.com/approval.pdf' })
  })

  it.each([false, true])('offers the annual form while withdrawn (approved admission: %s)', async (hasApplication) => {
    if (hasApplication) mocks.application.mockResolvedValue({
      id: 'registration-1', fatherOfConfessionName: 'Fr. Mark',
      approvalFormUrl: null, approvalFormFilename: null,
      mentorName: 'Old Mentor', mentorPhone: '555-0000', mentorEmail: 'old@example.com',
    })
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      annualMentorRequired: true, mentorReviewStatus: 'UPDATE_REQUIRED',
      showApprovalForm: true, missingDetails: ['approvalForm', 'mentorInformation'],
    })
  })

  it('keeps a submission withdrawn, then restores the student to attendance only on approval', async () => {
    const current = { ...enrollment, student: { id: 'student-1', name: 'Student' } }
    mocks.enrollment.mockImplementation(async ({ select }) => Object.fromEntries(
      Object.entries(current).filter(([key]) => select[key]),
    ))
    mocks.updateEnrollment.mockImplementation(async ({ data }) => {
      Object.assign(current, data)
      return { count: 1 }
    })
    expect(buildStudentMapFromEnrollments([current])).toEqual([])
    const response = await PATCH(new NextRequest('http://localhost/api/registration/application', {
      method: 'PATCH', body: JSON.stringify(information),
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ mentorReviewStatus: 'PENDING_REVIEW', complete: false })
    expect(mocks.upsertAnnual).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ studentId: 'student-1', academicYearId: 'year-1' }),
    }))
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({
      userId: 'staff-1', url: '/dashboard/admin/enrollments?studentId=student-1',
    })] }))
    expect(current).toMatchObject({ status: 'WITHDRAWN', isActive: false })
    expect(buildStudentMapFromEnrollments([current])).toEqual([])
    expect(mocks.updateEnrollment).toHaveBeenCalledExactlyOnceWith({
      where: { studentId: 'student-1' },
      data: { mentorName: information.mentorName, mentorPhone: information.mentorPhone },
    })

    mocks.annual.mockResolvedValue(information)
    mocks.auth.mockResolvedValue({ id: 'staff-1' })
    const reviewed = await review(new NextRequest('http://localhost/api/students/student-1/mentor-information/review', {
      method: 'POST', body: JSON.stringify({ updatedAt: updatedAt.toISOString() }),
    }), { params: Promise.resolve({ id: 'student-1' }) })
    expect(reviewed.status).toBe(200)
    expect(await reviewed.json()).toEqual({ reviewed: true, reactivated: true })
    expect(mocks.review).toHaveBeenCalledWith({
      where: { id: 'info-1', updatedAt },
      data: { reviewedAt: expect.any(Date), reviewedBy: 'staff-1' },
    })
    expect(current).toMatchObject({ status: 'ACTIVE', isActive: true })
    expect(buildStudentMapFromEnrollments([current])).toMatchObject([{ id: 'student-1' }])
  })

  it('uploads the signed form for a withdrawn legacy student and still requires staff review', async () => {
    const response = await upload({ formData: async () => ({
      get: () => new File(['signed approval'], 'approval.pdf', { type: 'application/pdf' }),
    }) } as unknown as NextRequest)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ complete: false })
    expect(mocks.updateEnrollment).toHaveBeenCalledExactlyOnceWith({
      where: { studentId: 'student-1' },
      data: { approvalFormUrl: 'https://example.com/approval.pdf', approvalFormFilename: 'approval.pdf' },
    })
    expect(mocks.clear).not.toHaveBeenCalled()
  })

  it.each(['GRADUATED', 'ACTIVE'])('does not open renewal for an inactive %s legacy student', async (status) => {
    mocks.enrollment.mockResolvedValue({ ...enrollment, status })
    expect((await GET()).status).toBe(404)
    expect(mocks.annual).not.toHaveBeenCalled()
  })
})
