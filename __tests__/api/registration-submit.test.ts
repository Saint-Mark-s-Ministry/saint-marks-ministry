import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StudentGrade } from '@prisma/client'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  findSettings: vi.fn(),
  findInviteCode: vi.fn(),
  findSubmission: vi.fn(),
  findUser: vi.fn(),
  createSubmission: vi.fn(),
  updateInviteCode: vi.fn(),
  transaction: vi.fn(),
  notifyNewRegistration: vi.fn(),
  emailReceived: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    systemSettings: { findUnique: mocks.findSettings },
    $transaction: mocks.transaction,
  },
}))
vi.mock('@/lib/notifications', () => ({
  notifyNewRegistration: mocks.notifyNewRegistration,
}))
vi.mock('@/lib/mail/notify', () => ({ emailRegistrationReceived: mocks.emailReceived }))

import { POST } from '@/app/api/registration/submit/route'

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/registration/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const requiredApplication = {
  inviteCode: 'SP-TESTCODE',
  email: 'student@example.com',
  fullName: 'Student Name',
  dateOfBirth: '2008-01-02',
  phone: '555-0100',
  previouslyServed: false,
  previousServiceLocation: '',
  currentlyServing: false,
  previouslyAttendedPrep: false,
  previousPrepLocation: '',
  grade: StudentGrade.GRADE_12,
  profileImageUrl: 'https://example.com/profile.jpg',
  profileImageFilename: 'profile.jpg',
}

describe('registration submission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findSettings.mockResolvedValue({ registrationEnabled: true })
    mocks.findInviteCode.mockResolvedValue({
      id: 'invite-1',
      code: 'SP-TESTCODE',
      isActive: true,
      expiresAt: null,
      usageCount: 0,
      maxUses: 10,
    })
    mocks.findSubmission.mockResolvedValue(null)
    mocks.findUser.mockResolvedValue(null)
    mocks.createSubmission.mockResolvedValue({ id: 'registration-1' })
    mocks.updateInviteCode.mockResolvedValue({})
    mocks.notifyNewRegistration.mockResolvedValue(undefined)
    mocks.transaction.mockImplementation(async (callback) => callback({
      inviteCode: {
        findUnique: mocks.findInviteCode,
        update: mocks.updateInviteCode,
      },
      registrationSubmission: {
        findFirst: mocks.findSubmission,
        create: mocks.createSubmission,
      },
      user: { findUnique: mocks.findUser },
    }))
  })

  it('accepts an application without approval or mentor information', async () => {
    const response = await POST(request(requiredApplication))

    expect(response.status).toBe(201)
    expect(mocks.createSubmission).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fatherOfConfessionName: null,
        previousServiceLocation: null,
        approvalFormUrl: null,
        approvalFormFilename: null,
        mentorName: null,
        mentorPhone: null,
        mentorEmail: null,
      }),
    })
    expect(mocks.notifyNewRegistration).toHaveBeenCalledWith({
      applicantName: 'Student Name',
      registrationId: 'registration-1',
    })
    expect(mocks.emailReceived).toHaveBeenCalledWith({ email: requiredApplication.email.toLowerCase(), name: 'Student Name' })
  })

  it('requires a location when the applicant previously served', async () => {
    const response = await POST(request({
      ...requiredApplication,
      previouslyServed: true,
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Previous service location is required when you have served before',
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('stores the previous service and Servants Prep locations when selected', async () => {
    const response = await POST(request({
      ...requiredApplication,
      previouslyServed: true,
      previousServiceLocation: '  St. Mark Youth Ministry  ',
      previouslyAttendedPrep: true,
      previousPrepLocation: '  St. George Servants Prep  ',
    }))

    expect(response.status).toBe(201)
    expect(mocks.createSubmission).toHaveBeenCalledWith({
      data: expect.objectContaining({
        previousServiceLocation: 'St. Mark Youth Ministry',
        previousPrepLocation: 'St. George Servants Prep',
      }),
    })
  })

  it('requires a location when the applicant previously attended Servants Prep', async () => {
    const response = await POST(request({
      ...requiredApplication,
      previouslyAttendedPrep: true,
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Previous prep location is required when you have attended before',
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('keeps post-approval application fields out of the initial registration', async () => {
    const response = await POST(request({
      ...requiredApplication,
      fatherOfConfessionName: 'Fr. Mark',
      approvalFormUrl: 'https://example.com/form.pdf',
      approvalFormFilename: 'form.pdf',
      mentorName: 'Mentor Name',
      mentorPhone: '555-0199',
      mentorEmail: 'not-an-email',
    }))

    expect(response.status).toBe(201)
    expect(mocks.createSubmission).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fatherOfConfessionName: null,
        approvalFormUrl: null,
        approvalFormFilename: null,
        mentorName: null,
        mentorPhone: null,
        mentorEmail: null,
      }),
    })
  })

  it('directs existing users to update mentor information from their account', async () => {
    mocks.findUser.mockResolvedValue({ id: 'user-1' })

    const response = await POST(request(requiredApplication))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toEqual({
      error: 'An account with this email already exists. Please sign in; registration is only for new applicants.',
    })
    expect(mocks.createSubmission).not.toHaveBeenCalled()
  })

  it('blocks an email that already has an approved application', async () => {
    mocks.findSubmission
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'registration-0' })

    const response = await POST(request(requiredApplication))

    expect(response.status).toBe(409)
    expect(mocks.findSubmission).toHaveBeenCalledWith({
      where: {
        email: 'student@example.com',
        status: 'APPROVED',
      },
      select: { id: true },
    })
  })

  it('rejects a second submission while one is pending', async () => {
    mocks.findSubmission.mockResolvedValueOnce({ id: 'registration-0' })

    const response = await POST(request(requiredApplication))

    expect(response.status).toBe(409)
    expect(mocks.createSubmission).not.toHaveBeenCalled()
  })

  it('rejects a second approved submission', async () => {
    mocks.findSubmission
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'registration-0' })

    const response = await POST(request(requiredApplication))

    expect(response.status).toBe(409)
    expect(mocks.createSubmission).not.toHaveBeenCalled()
  })
})
