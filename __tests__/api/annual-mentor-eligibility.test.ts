import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enrollment: vi.fn(), annual: vi.fn(), application: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: async () => ({ id: 'student-1', role: 'STUDENT' }) }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  academicYear: { findFirst: async () => ({ id: 'year-1', name: '2026-2027' }) },
  studentEnrollment: { findUnique: mocks.enrollment },
  annualMentorInformation: { findUnique: mocks.annual },
  registrationSubmission: { findFirst: mocks.application },
} }))

import { GET } from '@/app/api/registration/application/route'

const application = {
  id: 'application-1', fatherOfConfessionName: 'Fr. Mark',
  approvalFormUrl: 'https://example.invalid/approval.pdf', approvalFormFilename: 'approval.pdf',
  mentorName: 'Assigned Mentor', mentorPhone: '555-0100', mentorEmail: 'mentor@example.invalid',
}

describe('application state uses actual annual mentor eligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.application.mockResolvedValue(application)
    mocks.enrollment.mockResolvedValue({
      id: 'enrollment-1', isActive: true, isAsyncStudent: true, yearLevel: null,
      mentorId: 'mentor-1', mentorName: 'Assigned Mentor', mentorPhone: '555-0100',
    })
    mocks.annual.mockResolvedValue(null)
  })

  it('does not mark an async student without Year 2 as needing annual updates', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      annualMentorRequired: false, mentorReviewStatus: null,
      complete: true, missingDetails: [],
    })
    expect(mocks.annual).not.toHaveBeenCalled()
  })

  it('still reports missing admission information for an exempt async student', async () => {
    mocks.application.mockResolvedValue({ ...application, approvalFormUrl: null, approvalFormFilename: null })
    expect(await (await GET()).json()).toMatchObject({
      annualMentorRequired: false, mentorReviewStatus: null,
      complete: false, missingDetails: ['approvalForm'],
    })
  })

  it('keeps active Year 2 students pending until their annual submission is reviewed', async () => {
    mocks.enrollment.mockResolvedValue({ id: 'enrollment-1', isActive: true, isAsyncStudent: false, yearLevel: 'YEAR_2' })
    mocks.annual.mockResolvedValue({ ...application, reviewedAt: null })
    expect(await (await GET()).json()).toMatchObject({
      annualMentorRequired: true, mentorReviewStatus: 'PENDING_REVIEW',
      complete: false, missingDetails: ['mentorInformation'],
    })
  })

  it('clears the annual update state after Year 2 admin review', async () => {
    mocks.enrollment.mockResolvedValue({ id: 'enrollment-1', isActive: true, isAsyncStudent: false, yearLevel: 'YEAR_2' })
    mocks.annual.mockResolvedValue({ ...application, reviewedAt: new Date() })
    expect(await (await GET()).json()).toMatchObject({
      annualMentorRequired: true, mentorReviewStatus: 'REVIEWED', complete: true, missingDetails: [],
    })
  })
})
