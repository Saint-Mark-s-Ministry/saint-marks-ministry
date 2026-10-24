// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { RoleTag, UserRole } from '@prisma/client'
import { execFileSync } from 'node:child_process'

const auth = vi.hoisted(() => ({ id: 'prep-staff', role: 'SERVANT_PREP', name: 'Prep Staff' }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: async () => ({ ...auth }) }))
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { ...auth } }) }))
vi.mock('@/lib/notifications', () => ({ notifyMentorAssigned: vi.fn().mockResolvedValue(undefined) }))

import { prisma as db } from '@/lib/prisma'
import { PATCH as updateEnrollment } from '@/app/api/enrollments/[id]/route'
import { POST as bulkUpdate } from '@/app/api/enrollments/bulk-update/route'
import { GET as getApplication, PATCH as submitForm } from '@/app/api/registration/application/route'
import { GET as getRoster } from '@/app/api/enrollments/route'
import { POST as reviewForm } from '@/app/api/students/[id]/mentor-information/review/route'
import { getAuthorizationContext } from '@/lib/authorization'
import { ensureAnnualMentorReminder } from '@/lib/annual-mentor-information'

const enabled = process.env.RUN_MENTOR_RENEWAL_DB_TESTS === '1'
const request = (url: string, body: object, method = 'PATCH') => new NextRequest(`http://localhost${url}`, {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const promotion = () => updateEnrollment(request('/api/enrollments/enrollment', { yearLevel: 'YEAR_2', mentorId: 'previous-mentor' }), { params: Promise.resolve({ id: 'enrollment' }) })
const submittedDetails = { mentorName: 'Current Mentor', mentorPhone: '2015550123', mentorEmail: 'current@example.test' }

describe.skipIf(!enabled)('Year 2 mentor renewal database flow', () => {
  beforeAll(() => {
    const value = process.env.MENTOR_RENEWAL_TEST_DATABASE_URL
    if (!value || value !== process.env.SP_DATABASE_URL) throw new Error('Use the isolated mentor renewal test database for both URLs')
    const url = new URL(value)
    if (url.hostname !== '127.0.0.1' || url.searchParams.get('schema') !== 'mentor_renewal_test') throw new Error('Only the isolated local mentor_renewal_test schema is allowed')
  })
  afterAll(() => db.$disconnect())
  beforeEach(async () => {
    auth.id = 'prep-staff'; auth.role = 'SERVANT_PREP'; auth.name = 'Prep Staff'
    await db.notification.deleteMany()
    await db.mentorAssignment.deleteMany()
    await db.annualMentorInformation.deleteMany()
    await db.studentEnrollment.deleteMany()
    await db.userRoleAssignment.deleteMany()
    await db.user.deleteMany()
    await db.academicYear.deleteMany()
    for (const [id, role, tags, disabled] of [
      ['prep-staff', UserRole.SERVANT_PREP, [RoleTag.SERVANTS_PREP_SERVANT], false],
      ['super-admin', UserRole.SUPER_ADMIN, [RoleTag.SUPER_ADMIN], false],
      ['priest', UserRole.PRIEST, [RoleTag.PRIEST, RoleTag.SERVANTS_PREP_SERVANT], false],
      ['disabled-staff', UserRole.SERVANT_PREP, [RoleTag.SERVANTS_PREP_SERVANT], true],
      ['previous-mentor', UserRole.MENTOR, [RoleTag.SUNDAY_SCHOOL_SERVANT], false],
      ['student', UserRole.STUDENT, [RoleTag.SERVANTS_PREP_STUDENT], false],
    ] as const) {
      await db.user.create({ data: { id, name: id, email: `${id}@example.test`, password: 'test-only', role, isDisabled: disabled, mustChangePassword: false,
        roleAssignments: { create: tags.map(tag => ({ tag, source: 'SYSTEM' as const })) },
      } })
    }
    await db.academicYear.create({ data: { id: 'year', name: '2026-2027', startDate: new Date('2026-09-01Z'), endDate: new Date('2027-08-31Z'), isActive: true } })
    await db.studentEnrollment.create({ data: { id: 'enrollment', studentId: 'student', yearLevel: 'YEAR_1', mentorId: 'previous-mentor', mentorName: 'Previous Mentor', mentorPhone: '2015550999',
      approvalFormUrl: 'https://example.test/approval.pdf', approvalFormFilename: 'approval.pdf',
    } })
    await db.mentorAssignment.create({ data: { id: 'assignment', studentEnrollmentId: 'enrollment', mentorUserId: 'previous-mentor', assignedById: 'prep-staff' } })
  })

  it('resets mentor details, current-year form and access while preserving the old assignment history', async () => {
    await db.annualMentorInformation.create({ data: { studentId: 'student', academicYearId: 'year', mentorName: 'Old', mentorPhone: 'old', mentorEmail: 'old@example.test' } })
    const response = await promotion()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ mentorId: null, mentor: null, mentorName: null, mentorPhone: null, mentorContact: null, mentorForm: { status: 'REQUIRED' } })
    expect(await db.studentEnrollment.findUniqueOrThrow({ where: { id: 'enrollment' } })).toMatchObject({ yearLevel: 'YEAR_2', mentorId: null, mentorName: null, mentorPhone: null })
    expect(await db.mentorAssignment.findUniqueOrThrow({ where: { id: 'assignment' } })).toMatchObject({ endedAt: expect.any(Date), endedById: 'prep-staff', endReason: 'Promoted to Year 2' })
    expect(await db.annualMentorInformation.count()).toBe(0)
    expect((await getAuthorizationContext('previous-mentor')).prepStudentScope.kind).toBe('none')
    expect((await db.user.findUniqueOrThrow({ where: { id: 'previous-mentor' } })).role).toBe('SERVANT')
    // A repeat Year 2 save must preserve a new submission rather than reset it.
    await db.annualMentorInformation.create({ data: { studentId: 'student', academicYearId: 'year', ...submittedDetails } })
    expect((await updateEnrollment(request('/api/enrollments/enrollment', { yearLevel: 'YEAR_2' }), { params: Promise.resolve({ id: 'enrollment' }) }))).toHaveProperty('status', 200)
    expect(await db.annualMentorInformation.count()).toBe(1)
  })

  it('populates only on submission, notifies eligible Prep staff, and verifies from the roster with version checks', async () => {
    expect((await promotion()).status).toBe(200)
    auth.id = 'student'; auth.role = 'STUDENT'; auth.name = 'Student Name'
    expect((await (await getApplication()).json()).application).toMatchObject({ mentorName: null, mentorPhone: null, mentorEmail: null })
    await ensureAnnualMentorReminder('student')
    const saved = await submitForm(request('/api/registration/application', submittedDetails))
    expect(saved.status).toBe(200)
    expect((await saved.json()).mentorReviewStatus).toBe('PENDING_REVIEW')
    const tasks = await db.notification.findMany({ where: { type: 'ANNOUNCEMENT' } })
    expect(tasks.map(task => task.userId).sort()).toEqual(['prep-staff', 'super-admin'])
    expect(tasks.every(task => task.isPersistent && task.url === '/dashboard/admin/enrollments?studentId=student')).toBe(true)
    auth.id = 'prep-staff'; auth.role = 'SERVANT_PREP'
    const [row] = await (await getRoster(new Request('http://localhost/api/enrollments?studentId=student'))).json()
    expect(row.mentorContact).toEqual({ name: submittedDetails.mentorName, email: submittedDetails.mentorEmail, phone: submittedDetails.mentorPhone })
    expect(row.mentorForm.status).toBe('PENDING_REVIEW')
    const stale = await reviewForm(request('/api/students/student/mentor-information/review', { updatedAt: 'old' }, 'POST'), { params: Promise.resolve({ id: 'student' }) })
    expect(stale.status).toBe(409)
    expect(await db.notification.count({ where: { type: 'ANNOUNCEMENT' } })).toBe(2)
    const reviewed = await reviewForm(request('/api/students/student/mentor-information/review', { updatedAt: row.mentorForm.submission.updatedAt }, 'POST'), { params: Promise.resolve({ id: 'student' }) })
    expect(reviewed.status).toBe(200)
    expect(await db.notification.count()).toBe(0)
    const [verified] = await (await getRoster(new Request('http://localhost/api/enrollments?studentId=student'))).json()
    expect(verified.mentorForm.status).toBe('REVIEWED')
    // Resubmission reopens the same review workflow with only the latest task.
    auth.id = 'student'; auth.role = 'STUDENT'
    expect((await submitForm(request('/api/registration/application', { ...submittedDetails, mentorPhone: '2015550124' }))).status).toBe(200)
    expect(await db.notification.count({ where: { type: 'ANNOUNCEMENT' } })).toBe(2)
    expect((await db.annualMentorInformation.findFirstOrThrow()).reviewedAt).toBeNull()
  })

  it('resets bulk promotions and rejects account assignment without a submitted form', async () => {
    const promoted = await bulkUpdate(request('/api/enrollments/bulk-update', { enrollmentIds: ['enrollment'], updates: { yearLevel: 'YEAR_2' } }, 'POST'))
    expect(promoted.status).toBe(200)
    expect(await db.studentEnrollment.findUniqueOrThrow({ where: { id: 'enrollment' } })).toMatchObject({ mentorId: null, mentorName: null, mentorPhone: null })
    const assigned = await updateEnrollment(request('/api/enrollments/enrollment', { mentorId: 'previous-mentor' }), { params: Promise.resolve({ id: 'enrollment' }) })
    expect(assigned.status).toBe(409)
    expect(await db.mentorAssignment.count({ where: { endedAt: null } })).toBe(0)
  })

  it('handles simultaneous promotions without restoring the previous mentor', async () => {
    const responses = await Promise.all([promotion(), promotion()])
    expect(responses.some(response => response.status === 200)).toBe(true)
    expect(responses.every(response => [200, 409].includes(response.status))).toBe(true)
    expect((await db.studentEnrollment.findUniqueOrThrow({ where: { id: 'enrollment' } })).mentorId).toBeNull()
    expect(await db.mentorAssignment.count({ where: { endedAt: null } })).toBe(0)
    expect(await db.mentorAssignment.count()).toBe(1)
  })

  it('previews and repairs only stale unsubmitted Year 2 assignments while preserving submitted forms and other mentees', async () => {
    await db.studentEnrollment.update({ where: { id: 'enrollment' }, data: { yearLevel: 'YEAR_2' } })
    await db.user.create({ data: { id: 'submitted-student', name: 'Submitted Student', email: 'submitted@example.test', password: 'test-only', role: 'STUDENT' } })
    await db.studentEnrollment.create({ data: { id: 'submitted-enrollment', studentId: 'submitted-student', yearLevel: 'YEAR_2', mentorId: 'previous-mentor' } })
    await db.mentorAssignment.create({ data: { studentEnrollmentId: 'submitted-enrollment', mentorUserId: 'previous-mentor' } })
    await db.annualMentorInformation.create({ data: { studentId: 'submitted-student', academicYearId: 'year', ...submittedDetails } })
    const run = (...args: string[]) => JSON.parse(execFileSync('bun', ['scripts/reset-unsubmitted-year-two-mentors.ts', ...args], { encoding: 'utf8' }).trim())
    expect(run()).toEqual({ mode: 'preview', affectedEnrollments: 1 })
    expect((await db.studentEnrollment.findUniqueOrThrow({ where: { id: 'enrollment' } })).mentorId).toBe('previous-mentor')
    expect(run('--apply')).toEqual({ mode: 'applied', affectedEnrollments: 1 })
    expect((await db.studentEnrollment.findUniqueOrThrow({ where: { id: 'enrollment' } })).mentorId).toBeNull()
    expect((await db.studentEnrollment.findUniqueOrThrow({ where: { id: 'submitted-enrollment' } })).mentorId).toBe('previous-mentor')
    expect((await db.user.findUniqueOrThrow({ where: { id: 'previous-mentor' } })).role).toBe('MENTOR')
    expect(await db.annualMentorInformation.count()).toBe(1)
    expect(run('--apply')).toEqual({ mode: 'applied', affectedEnrollments: 0 })
  })
})
