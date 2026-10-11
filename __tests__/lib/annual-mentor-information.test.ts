import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findActiveYear: vi.fn(),
  findEnrollment: vi.fn(),
  findAnnualInformation: vi.fn(),
  findReminder: vi.fn(),
  createReminder: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    academicYear: { findFirst: mocks.findActiveYear },
    studentEnrollment: { findUnique: mocks.findEnrollment },
    annualMentorInformation: { findUnique: mocks.findAnnualInformation },
    notification: {
      findFirst: mocks.findReminder,
      create: mocks.createReminder,
    },
  },
}))

import { ensureAnnualMentorReminder } from '@/lib/annual-mentor-information'

describe('Year 2 mentor information reminder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findActiveYear.mockResolvedValue({ id: 'year-1', name: '2026-2027' })
    mocks.findEnrollment.mockResolvedValue({
      id: 'enrollment-1',
      isActive: true,
      yearLevel: 'YEAR_2',
      mentorName: 'Previous Mentor',
      mentorPhone: '555-0100',
    })
    mocks.findAnnualInformation.mockResolvedValue(null)
    mocks.findReminder.mockResolvedValue(null)
    mocks.createReminder.mockResolvedValue({ id: 'reminder-1' })
  })

  it('creates a persistent prompt for a promoted student missing this year information', async () => {
    await ensureAnnualMentorReminder('student-1')

    expect(mocks.createReminder).toHaveBeenCalledWith({
      data: {
        userId: 'student-1',
        type: 'REGISTRATION_INCOMPLETE',
        title: 'Mentor Information Required',
        body: 'Please confirm your mentor servant information for 2026-2027. This reminder will remain until it is complete.',
        url: '/dashboard/student/application',
        isPersistent: true,
        metadata: {
          kind: 'annualMentorInformation',
          academicYearId: 'year-1',
          missingDetails: ['mentor servant information'],
        },
      },
    })
  })

  it('also catches students who were already promoted before deployment', async () => {
    await ensureAnnualMentorReminder('student-already-promoted')

    expect(mocks.findEnrollment).toHaveBeenCalledWith({
      where: { studentId: 'student-already-promoted' },
      select: {
        id: true,
        isActive: true,
        yearLevel: true,
        mentorName: true,
        mentorPhone: true,
      },
    })
    expect(mocks.createReminder).toHaveBeenCalledOnce()
  })

  it('does not prompt again after the current year information is submitted', async () => {
    mocks.findAnnualInformation.mockResolvedValue({ id: 'annual-info-1' })

    await ensureAnnualMentorReminder('student-1')

    expect(mocks.findReminder).not.toHaveBeenCalled()
    expect(mocks.createReminder).not.toHaveBeenCalled()
  })

  it('does not require annual reconfirmation until a student reaches Year 2', async () => {
    mocks.findEnrollment.mockResolvedValue({
      id: 'enrollment-1',
      isActive: true,
      yearLevel: 'YEAR_1',
    })

    await ensureAnnualMentorReminder('student-1')

    expect(mocks.findAnnualInformation).not.toHaveBeenCalled()
    expect(mocks.createReminder).not.toHaveBeenCalled()
  })
})
