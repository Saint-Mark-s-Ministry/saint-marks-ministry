import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { RegistrationStatus, UserRole } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  transaction: vi.fn(),
  findSubmission: vi.fn(),
  updateSubmission: vi.fn(),
  deleteSubmission: vi.fn(),
  updateInviteCode: vi.fn(),
  findUser: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  findRoleAssignment: vi.fn(),
  createRoleAssignment: vi.fn(),
  findEnrollment: vi.fn(),
  updateEnrollment: vi.fn(),
  deleteNotifications: vi.fn(),
  findAcademicYear: vi.fn(),
  findFather: vi.fn(),
  createEnrollment: vi.fn(),
  createNotification: vi.fn(),
  hash: vi.fn(),
  backfillAttendance: vi.fn(),
  notifyReviewed: vi.fn(),
  emailApproved: vi.fn(),
  emailNotApproved: vi.fn(),
  deleteBlob: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }))
vi.mock('bcryptjs', () => ({ default: { hash: mocks.hash } }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }))
vi.mock('@/lib/api-utils', () => ({ backfillAttendanceForStudent: mocks.backfillAttendance }))
vi.mock('@/lib/notifications', () => ({ notifyRegistrationReviewed: mocks.notifyReviewed }))
vi.mock('@/lib/mail/notify', () => ({
  emailRegistrationApproved: mocks.emailApproved,
  emailRegistrationNotApproved: mocks.emailNotApproved,
}))
vi.mock('@vercel/blob', () => ({ del: mocks.deleteBlob }))

import { POST } from '@/app/api/registration/submissions/[id]/review/route'

describe('registration approval follow-up', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getServerSession.mockResolvedValue({
      user: { id: 'admin-1', role: UserRole.SUPER_ADMIN },
    })
    mocks.hash.mockResolvedValue('hashed-password')
    mocks.findSubmission.mockResolvedValue({
      id: 'registration-1',
      status: RegistrationStatus.PENDING,
      email: 'student@example.com',
      fullName: 'Student Name',
      phone: '555-0100',
      profileImageUrl: 'https://example.com/profile.jpg',
      fatherOfConfessionName: null,
      approvalFormUrl: null,
      approvalFormFilename: null,
      mentorName: null,
      mentorPhone: null,
      mentorEmail: null,
    })
    mocks.findUser.mockResolvedValue(null)
    mocks.findRoleAssignment.mockResolvedValue(null)
    mocks.createRoleAssignment.mockResolvedValue({ id: 'role-assignment-1' })
    mocks.deleteSubmission.mockResolvedValue({ id: 'registration-1' })
    mocks.updateInviteCode.mockResolvedValue({ count: 1 })
    mocks.deleteBlob.mockResolvedValue(undefined)
    mocks.createUser.mockResolvedValue({ id: 'student-1', authVersion: 0 })
    mocks.findAcademicYear.mockResolvedValue({ id: 'year-1' })
    mocks.findFather.mockResolvedValue({ id: 'father-1' })
    mocks.createEnrollment.mockResolvedValue({ id: 'enrollment-1' })
    mocks.createNotification.mockResolvedValue({ id: 'notification-1' })
    mocks.backfillAttendance.mockResolvedValue(undefined)
    mocks.updateSubmission.mockResolvedValue({
      id: 'registration-1',
      email: 'student@example.com',
      fullName: 'Student Name',
      createdUser: { id: 'student-1' },
    })
    mocks.notifyReviewed.mockResolvedValue(undefined)
    mocks.transaction.mockImplementation(async (callback) => callback({
      registrationSubmission: {
        findUnique: mocks.findSubmission,
        update: mocks.updateSubmission,
        delete: mocks.deleteSubmission,
      },
      inviteCode: { updateMany: mocks.updateInviteCode },
      user: {
        findUnique: mocks.findUser,
        create: mocks.createUser,
        update: mocks.updateUser,
      },
      userRoleAssignment: {
        findFirst: mocks.findRoleAssignment,
        create: mocks.createRoleAssignment,
      },
      academicYear: { findFirst: mocks.findAcademicYear },
      fatherOfConfession: {
        findFirst: mocks.findFather,
        create: vi.fn(),
      },
      studentEnrollment: {
        create: mocks.createEnrollment,
        findUnique: mocks.findEnrollment,
        update: mocks.updateEnrollment,
      },
      notification: {
        create: mocks.createNotification,
        deleteMany: mocks.deleteNotifications,
      },
    }))
  })

  it('creates a persistent reminder for the post-approval application', async () => {
    const request = new NextRequest('http://localhost/api/registration/submissions/registration-1/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', yearLevel: 'YEAR_1' }),
    })

    const response = await POST(request, { params: Promise.resolve({ id: 'registration-1' }) })

    expect(response.status).toBe(200)
    expect(mocks.createNotification).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'student-1',
        type: 'REGISTRATION_INCOMPLETE',
        url: '/dashboard/student/application',
        isPersistent: true,
        metadata: {
          registrationId: 'registration-1',
          missingDetails: ['father of confession', 'approval form', 'mentor servant information'],
        },
      }),
    })
    // A new account gets a set-password link bound to its current authVersion.
    expect(mocks.emailApproved).toHaveBeenCalledWith(
      { email: 'student@example.com', name: 'Student Name' },
      { email: 'student@example.com', name: 'Student Name', id: 'student-1', authVersion: 0 }
    )
    expect(mocks.createUser).toHaveBeenCalledWith({
      data: expect.objectContaining({
        role: 'STUDENT',
        roleAssignments: {
          create: {
            tag: 'SERVANTS_PREP_STUDENT',
            source: 'PREP_REGISTRATION',
            grantedById: 'admin-1',
            note: 'Granted when Servants Prep registration was approved',
          },
        },
      }),
    })
  })

  it('approves a returning applicant by updating their existing account', async () => {
    mocks.findSubmission.mockResolvedValue({
      id: 'registration-2',
      status: RegistrationStatus.PENDING,
      email: 'student@example.com',
      fullName: 'Student Name',
      phone: '555-0101',
      profileImageUrl: 'https://example.com/new-profile.jpg',
      fatherOfConfessionName: 'Fr. Mark',
      approvalFormUrl: 'https://example.com/form.pdf',
      approvalFormFilename: 'form.pdf',
      mentorName: null,
      mentorPhone: null,
      mentorEmail: null,
      createdUserId: 'student-1',
    })
    mocks.findUser.mockResolvedValue({
      id: 'student-1',
      role: UserRole.STUDENT,
      profileImageUrl: 'https://example.com/old-profile.jpg',
    })
    mocks.findEnrollment.mockResolvedValue({ id: 'enrollment-1', isActive: true })
    mocks.updateSubmission.mockResolvedValue({
      id: 'registration-2',
      email: 'student@example.com',
      fullName: 'Student Name',
      createdUser: { id: 'student-1' },
    })

    const request = new NextRequest('http://localhost/api/registration/submissions/registration-2/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', yearLevel: 'YEAR_1' }),
    })

    const response = await POST(request, { params: Promise.resolve({ id: 'registration-2' }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.tempPassword).toBeNull()
    expect(body.linkedExistingUser).toBe(true)
    expect(mocks.createUser).not.toHaveBeenCalled()
    expect(mocks.hash).not.toHaveBeenCalled()
    expect(mocks.createEnrollment).not.toHaveBeenCalled()
    expect(mocks.emailApproved).toHaveBeenCalledWith({ email: 'student@example.com', name: 'Student Name' }, undefined)
    expect(mocks.updateUser).toHaveBeenCalledWith({
      where: { id: 'student-1' },
      data: { phone: '555-0101', profileImageUrl: 'https://example.com/new-profile.jpg' },
    })
    expect(mocks.findRoleAssignment).toHaveBeenCalledWith({
      where: {
        userId: 'student-1',
        tag: 'SERVANTS_PREP_STUDENT',
        revokedAt: null,
      },
      select: { id: true },
    })
    expect(mocks.createRoleAssignment).toHaveBeenCalledWith({
      data: {
        userId: 'student-1',
        tag: 'SERVANTS_PREP_STUDENT',
        source: 'PREP_REGISTRATION',
        grantedById: 'admin-1',
        note: 'Granted when Servants Prep registration was approved',
      },
    })
    // Year level is left alone and an existing mentor is not wiped
    expect(mocks.updateEnrollment).toHaveBeenCalledWith({
      where: { id: 'enrollment-1' },
      data: { fatherOfConfessionId: 'father-1' },
    })
    expect(mocks.deleteNotifications).toHaveBeenCalled()
    expect(mocks.createNotification).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'student-1',
        metadata: {
          registrationId: 'registration-2',
          missingDetails: ['mentor servant information'],
        },
      }),
    })
    expect(mocks.updateSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ createdUserId: 'student-1' }),
      })
    )
  })

  it('does not create a reminder for a legacy submission that is already complete', async () => {
    mocks.findSubmission.mockResolvedValue({
      id: 'registration-3',
      status: RegistrationStatus.PENDING,
      email: 'new-student@example.com',
      fullName: 'New Student',
      phone: '555-0102',
      profileImageUrl: 'https://example.com/profile.jpg',
      fatherOfConfessionName: 'Fr. Mark',
      approvalFormUrl: 'https://example.com/form.pdf',
      approvalFormFilename: 'form.pdf',
      mentorName: 'Mentor Name',
      mentorPhone: '555-0199',
      mentorEmail: 'mentor@example.com',
    })

    const request = new NextRequest('http://localhost/api/registration/submissions/registration-3/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', yearLevel: 'YEAR_1' }),
    })

    const response = await POST(request, { params: Promise.resolve({ id: 'registration-3' }) })

    expect(response.status).toBe(200)
    expect(mocks.createNotification).not.toHaveBeenCalled()
  })

  it('does not duplicate an active Servants Prep student role for a returning applicant', async () => {
    mocks.findSubmission.mockResolvedValue({
      id: 'registration-4',
      status: RegistrationStatus.PENDING,
      email: 'student@example.com',
      fullName: 'Student Name',
      phone: '555-0103',
      profileImageUrl: null,
      fatherOfConfessionName: null,
      approvalFormUrl: null,
      approvalFormFilename: null,
      mentorName: null,
      mentorPhone: null,
      mentorEmail: null,
      createdUserId: 'student-1',
    })
    mocks.findUser.mockResolvedValue({
      id: 'student-1',
      role: UserRole.STUDENT,
      profileImageUrl: null,
    })
    mocks.findRoleAssignment.mockResolvedValue({ id: 'existing-role-assignment' })
    mocks.findEnrollment.mockResolvedValue({ id: 'enrollment-1', isActive: true })
    mocks.updateSubmission.mockResolvedValue({
      id: 'registration-4',
      email: 'student@example.com',
      fullName: 'Student Name',
      createdUser: { id: 'student-1' },
    })

    const request = new NextRequest('http://localhost/api/registration/submissions/registration-4/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', yearLevel: 'YEAR_1' }),
    })

    const response = await POST(request, { params: Promise.resolve({ id: 'registration-4' }) })

    expect(response.status).toBe(200)
    expect(mocks.createRoleAssignment).not.toHaveBeenCalled()
  })

  it('deletes a rejected application so the applicant can register again', async () => {
    mocks.findSubmission.mockResolvedValue({
      id: 'registration-5',
      inviteCodeId: 'invite-1',
      status: RegistrationStatus.PENDING,
      email: 'student@example.com',
      fullName: 'Student Name',
      approvalFormUrl: 'https://example.com/form.pdf',
      profileImageUrl: 'https://example.com/profile.jpg',
    })

    const request = new NextRequest('http://localhost/api/registration/submissions/registration-5/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', note: 'Please correct and resubmit' }),
    })

    const response = await POST(request, { params: Promise.resolve({ id: 'registration-5' }) })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: 'Registration rejected and removed',
    })
    expect(mocks.deleteSubmission).toHaveBeenCalledWith({ where: { id: 'registration-5' } })
    expect(mocks.updateInviteCode).toHaveBeenCalledWith({
      where: { id: 'invite-1', usageCount: { gt: 0 } },
      data: { usageCount: { decrement: 1 } },
    })
    expect(mocks.deleteNotifications).toHaveBeenCalledWith({
      where: {
        type: 'REGISTRATION_RECEIVED',
        metadata: { path: ['registrationId'], equals: 'registration-5' },
      },
    })
    expect(mocks.deleteBlob).toHaveBeenCalledWith([
      'https://example.com/form.pdf',
      'https://example.com/profile.jpg',
    ])
    expect(mocks.emailNotApproved).toHaveBeenCalledWith({
      email: 'student@example.com',
      name: 'Student Name',
    })
  })
})
