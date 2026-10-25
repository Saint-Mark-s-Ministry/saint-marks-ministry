import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { RegistrationStatus, UserRole } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  autoLink: vi.fn(),
  deleteUser: vi.fn(),
  countOtherRoles: vi.fn(),
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
  migrate: vi.fn(),
  audit: vi.fn(),
}))

vi.mock('@/lib/student-prep-migration', () => ({ migrateStudentPrepData: mocks.migrate }))
vi.mock('@/lib/user-deletion', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/user-deletion')>(),
  deleteUserWithRelations: mocks.deleteUser,
}))

vi.mock('@/lib/prep-roster-auto-link', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/prep-roster-auto-link')>(),
  autoLinkPrepStudentToRoster: mocks.autoLink,
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
    vi.resetAllMocks()
    mocks.migrate.mockResolvedValue({ enrollments: 1, attendance: 12, exams: 5 })
    mocks.autoLink.mockResolvedValue({ status: 'not_applicable', reason: 'Outside matching scope' })
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
    mocks.countOtherRoles.mockResolvedValue(0)
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
        count: mocks.countOtherRoles,
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
      auditEvent: { create: mocks.audit },
      notification: {
        create: mocks.createNotification,
        deleteMany: mocks.deleteNotifications,
      },
    }))
  })

  const replaceRequest = (options: object = { migrateHistory: false }) => new NextRequest('http://localhost/api/registration/submissions/registration-1/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'approve', replaceUserId: 'old-student', ...options }),
  })

  it('approves and deletes the selected exact-name account in the same serializable transaction', async () => {
    mocks.findUser.mockResolvedValueOnce({ id: 'admin-1', role: UserRole.SUPER_ADMIN, isDisabled: false }).mockResolvedValueOnce({ id: 'old-student', name: 'Student Name', role: UserRole.STUDENT })
    const response = await POST(replaceRequest(), { params: Promise.resolve({ id: 'registration-1' }) })
    expect(response.status).toBe(200)
    expect((await response.json()).replacedUserId).toBe('old-student')
    expect(mocks.deleteUser).toHaveBeenCalledWith(expect.anything(), 'old-student')
    expect(mocks.createUser).toHaveBeenCalled()
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable', timeout: 30000 })
  })

  it('requires an explicit migration choice before replacing an account', async () => {
    const response = await POST(replaceRequest({}), { params: Promise.resolve({ id: 'registration-1' }) })
    expect(response.status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it.each(['yes', 1, null])('rejects an invalid migration choice: %s', async migrateHistory => {
    const response = await POST(replaceRequest({ migrateHistory }), { params: Promise.resolve({ id: 'registration-1' }) })
    expect(response.status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('transfers records before deletion, reuses the old enrollment, and records the decision', async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: 'prep-reviewer', role: UserRole.SERVANT_PREP } })
    mocks.findUser.mockResolvedValueOnce({ id: 'prep-reviewer', role: UserRole.SERVANT_PREP }).mockResolvedValueOnce({ id: 'old-student', name: 'Student Name', role: UserRole.STUDENT })
    const response = await POST(replaceRequest({ migrateHistory: true, yearLevel: 'YEAR_2' }), { params: Promise.resolve({ id: 'registration-1' }) })
    expect(response.status).toBe(200)
    expect((await response.json()).migratedData).toMatchObject({ attendance: 12, exams: 5 })
    expect(mocks.migrate).toHaveBeenCalledWith(expect.anything(), 'old-student', 'student-1')
    expect(mocks.createEnrollment).not.toHaveBeenCalled()
    expect(mocks.updateEnrollment).toHaveBeenCalledWith({ where: { studentId: 'student-1' }, data: expect.objectContaining({ yearLevel: 'YEAR_2', isAsyncStudent: false }) })
    expect(mocks.migrate.mock.invocationCallOrder[0]).toBeLessThan(mocks.deleteUser.mock.invocationCallOrder[0])
    expect(mocks.backfillAttendance).not.toHaveBeenCalled()
    expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: 'prep-reviewer', metadata: expect.objectContaining({ migrateHistory: true, oldUserId: 'old-student', newUserId: 'student-1' }) }) })
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable', timeout: 30000 })
  })

  it('creates an enrollment if the old account has no enrollment to transfer', async () => {
    mocks.findUser.mockResolvedValueOnce({ id: 'admin-1', role: UserRole.SUPER_ADMIN }).mockResolvedValueOnce({ id: 'old-student', name: 'Student Name', role: UserRole.STUDENT })
    mocks.migrate.mockResolvedValueOnce({ enrollments: 0, attendance: 2, exams: 1 })
    const response = await POST(replaceRequest({ migrateHistory: true }), { params: Promise.resolve({ id: 'registration-1' }) })
    expect(response.status).toBe(200)
    expect(mocks.createEnrollment).toHaveBeenCalledOnce()
    expect(mocks.deleteUser).toHaveBeenCalledOnce()
  })

  it('does not delete the old account or approve if a transfer fails', async () => {
    mocks.findUser.mockResolvedValueOnce({ id: 'admin-1', role: UserRole.SUPER_ADMIN }).mockResolvedValueOnce({ id: 'old-student', name: 'Student Name', role: UserRole.STUDENT })
    mocks.migrate.mockRejectedValueOnce(new Error('Transfer failed'))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await POST(replaceRequest({ migrateHistory: true }), { params: Promise.resolve({ id: 'registration-1' }) })
    errorLog.mockRestore()
    expect(response.status).toBe(500)
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(mocks.updateSubmission).not.toHaveBeenCalled()
    expect(mocks.notifyReviewed).not.toHaveBeenCalled()
  })

  it.each([UserRole.SERVANT, UserRole.MENTOR, UserRole.STUDENT])('does not allow %s to migrate an account', async role => {
    mocks.getServerSession.mockResolvedValue({ user: { id: 'viewer', role } })
    const response = await POST(replaceRequest({ migrateHistory: true }), { params: Promise.resolve({ id: 'registration-1' }) })
    expect(response.status).toBe(403)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('rejects a target that no longer matches without deleting or approving', async () => {
    mocks.findUser.mockResolvedValueOnce({ id: 'admin-1', role: UserRole.SUPER_ADMIN }).mockResolvedValueOnce({ id: 'old-student', name: 'Student Name', role: UserRole.STUDENT })
    mocks.findUser.mockReset().mockResolvedValueOnce({ id: 'admin-1', role: UserRole.SUPER_ADMIN }).mockResolvedValueOnce({ id: 'old-student', name: 'Different Name', role: UserRole.STUDENT })
    const response = await POST(replaceRequest(), { params: Promise.resolve({ id: 'registration-1' }) })
    expect(response.status).toBe(409)
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it('rejects a reviewer whose database permission was revoked', async () => {
    mocks.findUser.mockResolvedValueOnce({ id: 'admin-1', role: UserRole.PRIEST })
    const response = await POST(replaceRequest(), { params: Promise.resolve({ id: 'registration-1' }) })
    expect(response.status).toBe(409)
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('prevents prep reviewers from removing accounts with other ministry roles', async () => {
    mocks.findUser.mockResolvedValueOnce({ id: 'admin-1', role: UserRole.SERVANT_PREP }).mockResolvedValueOnce({ id: 'old-student', name: 'Student Name', role: UserRole.STUDENT })
    mocks.countOtherRoles.mockResolvedValue(1)
    const response = await POST(replaceRequest(), { params: Promise.resolve({ id: 'registration-1' }) })
    expect(response.status).toBe(409)
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('does not approve when old-account deletion has protected records', async () => {
    const { UserDeletionConflictError } = await import('@/lib/user-deletion')
    mocks.findUser.mockResolvedValueOnce({ id: 'admin-1', role: UserRole.SUPER_ADMIN }).mockResolvedValueOnce({ id: 'old-student', name: 'Student Name', role: UserRole.STUDENT })
    mocks.deleteUser.mockRejectedValueOnce(new UserDeletionConflictError('Protected history'))
    const response = await POST(replaceRequest(), { params: Promise.resolve({ id: 'registration-1' }) })
    expect(response.status).toBe(409)
    expect(mocks.createUser).not.toHaveBeenCalled()
    expect(mocks.updateSubmission).not.toHaveBeenCalled()
  })

  it.each([null, { user: { id: 'student-1', role: UserRole.STUDENT } }])('does not run matching for an unauthorized reviewer', async session => {
    mocks.getServerSession.mockResolvedValue(session)
    const response = await POST(new NextRequest('http://localhost/review', {
      method: 'POST', body: JSON.stringify({ action: 'approve' }),
    }), { params: Promise.resolve({ id: 'registration-1' }) })
    expect([401, 403]).toContain(response.status)
    expect(mocks.autoLink).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('runs matching after approval inside the same serializable transaction and returns a safe result', async () => {
    mocks.autoLink.mockResolvedValue({ status: 'linked', reason: 'Verified roster match' })
    const response = await POST(new NextRequest('http://localhost/review', {
      method: 'POST', body: JSON.stringify({ action: 'approve' }),
    }), { params: Promise.resolve({ id: 'registration-1' }) })
    expect(response.status).toBe(200)
    expect((await response.json()).sundaySchoolMatch).toEqual({ status: 'linked', reason: 'Verified roster match' })
    expect(mocks.autoLink).toHaveBeenCalledWith(expect.anything(), 'student-1', 'admin-1', 'registration-1')
    expect(mocks.updateSubmission.mock.invocationCallOrder[0]).toBeLessThan(mocks.autoLink.mock.invocationCallOrder[0])
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' })
  })

  it('returns a retryable conflict and sends no approval notifications if a roster link changes', async () => {
    const { PrepRosterLinkConflictError } = await import('@/lib/prep-roster-auto-link')
    mocks.autoLink.mockRejectedValueOnce(new PrepRosterLinkConflictError())
    const response = await POST(new NextRequest('http://localhost/review', {
      method: 'POST', body: JSON.stringify({ action: 'approve' }),
    }), { params: Promise.resolve({ id: 'registration-1' }) })
    expect(response.status).toBe(409)
    expect(mocks.emailApproved).not.toHaveBeenCalled()
    expect(mocks.notifyReviewed).not.toHaveBeenCalled()
  })

  it('still approves registrations when matching needs manual review', async () => {
    mocks.autoLink.mockResolvedValue({ status: 'review', reason: 'Birth dates differ' })
    const response = await POST(new NextRequest('http://localhost/review', {
      method: 'POST', body: JSON.stringify({ action: 'approve' }),
    }), { params: Promise.resolve({ id: 'registration-1' }) })
    expect(response.status).toBe(200)
    expect((await response.json()).sundaySchoolMatch.status).toBe('review')
    expect(mocks.emailApproved).toHaveBeenCalledOnce()
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

  it.each([false, true])('starts an async registration without a cohort year or lesson absences (existing account: %s)', async existingAccount => {
    if (existingAccount) {
      mocks.findUser.mockResolvedValue({ id: 'student-1', role: UserRole.STUDENT })
      mocks.findEnrollment.mockResolvedValue(null)
    }
    const request = new NextRequest('http://localhost/api/registration/submissions/registration-1/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', yearLevel: null, isAsyncStudent: true }),
    })
    const response = await POST(request, { params: Promise.resolve({ id: 'registration-1' }) })

    expect(response.status).toBe(200)
    expect(mocks.createEnrollment).toHaveBeenCalledWith({ data: expect.objectContaining({
      studentId: 'student-1', yearLevel: null, isAsyncStudent: true,
      asyncApprovedAt: expect.any(Date), asyncApprovedBy: 'admin-1',
    }) })
    expect(mocks.backfillAttendance).not.toHaveBeenCalled()
  })

  it.each([undefined, 'YEAR_1', 'YEAR_2'])('preserves in-person approval and attendance backfill for %s', async yearLevel => {
    const request = new NextRequest('http://localhost/api/registration/submissions/registration-1/review', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', yearLevel }),
    })
    expect((await POST(request, { params: Promise.resolve({ id: 'registration-1' }) })).status).toBe(200)
    expect(mocks.createEnrollment).toHaveBeenCalledWith({ data: expect.objectContaining({
      yearLevel: yearLevel ?? 'YEAR_1', isAsyncStudent: false,
      asyncApprovedAt: null, asyncApprovedBy: null,
    }) })
    expect(mocks.backfillAttendance).toHaveBeenCalledWith('student-1', 'year-1', expect.anything())
  })

  it.each([
    { isAsyncStudent: 'true' },
    { yearLevel: 'ASYNC' },
    { isAsyncStudent: true, yearLevel: 'YEAR_1' },
    { isAsyncStudent: false, yearLevel: null },
  ])('rejects an invalid starting class before creating any records: %o', async startingProgram => {
    const request = new NextRequest('http://localhost/api/registration/submissions/registration-1/review', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', ...startingProgram }),
    })
    expect((await POST(request, { params: Promise.resolve({ id: 'registration-1' }) })).status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.emailApproved).not.toHaveBeenCalled()
  })

  it('preserves the program of a returning async student and skips lesson backfill', async () => {
    mocks.findUser.mockResolvedValue({ id: 'student-1', role: UserRole.STUDENT })
    mocks.findEnrollment.mockResolvedValue({ id: 'enrollment-1', isActive: true, isAsyncStudent: true })
    const request = new NextRequest('http://localhost/api/registration/submissions/registration-1/review', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', yearLevel: 'YEAR_1', isAsyncStudent: false }),
    })
    expect((await POST(request, { params: Promise.resolve({ id: 'registration-1' }) })).status).toBe(200)
    expect(mocks.createEnrollment).not.toHaveBeenCalled()
    expect(mocks.updateEnrollment.mock.calls[0][0].data).not.toHaveProperty('yearLevel')
    expect(mocks.updateEnrollment.mock.calls[0][0].data).not.toHaveProperty('isAsyncStudent')
    expect(mocks.backfillAttendance).not.toHaveBeenCalled()
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
