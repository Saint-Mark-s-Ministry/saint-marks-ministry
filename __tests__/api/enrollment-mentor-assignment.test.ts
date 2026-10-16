import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleTag, UserRole } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  candidate: vi.fn(),
  existingEnrollment: vi.fn(),
  transaction: vi.fn(),
  currentEnrollment: vi.fn(),
  saveEnrollment: vi.fn(),
  endAssignments: vi.fn(),
  createAssignment: vi.fn(),
  compatibilityUser: vi.fn(),
  updateUser: vi.fn(),
  backfill: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  user: { findUnique: mocks.candidate },
  studentEnrollment: { findUnique: mocks.existingEnrollment },
  $transaction: mocks.transaction,
} }))
vi.mock('@/lib/api-utils', () => ({
  backfillAttendanceForStudent: mocks.backfill,
  enrollmentStatusUpdate: vi.fn(),
  reconcileLateStartAttendance: vi.fn(),
}))
vi.mock('@/lib/student-mentor-contact', () => ({
  withEnrollmentMentorContacts: async (enrollments: unknown[]) => enrollments,
}))
vi.mock('@/lib/notifications', () => ({ notifyMentorAssigned: vi.fn().mockResolvedValue(undefined) }))

import { POST } from '@/app/api/enrollments/route'
import { PATCH } from '@/app/api/enrollments/[id]/route'

const tx = {
  studentEnrollment: {
    findUniqueOrThrow: mocks.currentEnrollment,
    create: mocks.saveEnrollment,
    update: mocks.saveEnrollment,
  },
  mentorAssignment: { updateMany: mocks.endAssignments, create: mocks.createAssignment },
  user: { findUniqueOrThrow: mocks.compatibilityUser, update: mocks.updateUser },
}

const staffTag = { tag: RoleTag.SUNDAY_SCHOOL_SERVANT, revokedAt: null }

function request(method: string, body: Record<string, unknown>) {
  return new Request('http://localhost/api/enrollments', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const operations = {
  create: (mentorId: string | null) => POST(request('POST', {
    studentId: 'student-1', yearLevel: 'YEAR_1', academicYearId: 'year-1', mentorId,
  })),
  update: (mentorId: string | null) => PATCH(request('PATCH', { mentorId }), {
    params: Promise.resolve({ id: 'enrollment-1' }),
  }),
}

describe('admin mentor assignments with access tags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'leader-1', role: UserRole.SERVANT_PREP })
    mocks.candidate.mockResolvedValue({ role: UserRole.SERVANT, isDisabled: false, roleAssignments: [staffTag] })
    mocks.existingEnrollment.mockResolvedValue(null)
    mocks.currentEnrollment.mockResolvedValue({ mentorId: null })
    mocks.saveEnrollment.mockResolvedValue({
      id: 'enrollment-1', studentId: 'student-1', status: 'ACTIVE',
      student: { id: 'student-1' }, mentor: { id: 'sarah', name: 'Sarah' },
    })
    mocks.compatibilityUser.mockResolvedValue({
      role: UserRole.SERVANT, roleAssignments: [staffTag], mentorAssignments: [{ id: 'assignment-1' }],
    })
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx))
  })

  for (const [operation, run] of Object.entries(operations)) {
    describe(operation, () => {
      it('accepts a Sunday School servant and enables only mentor access in the same transaction', async () => {
        const response = await run('sarah')
        expect(response.status).toBe(operation === 'create' ? 201 : 200)
        expect(mocks.candidate).toHaveBeenCalledWith({
          where: { id: 'sarah' },
          select: { role: true, isDisabled: true, roleAssignments: { select: { tag: true, revokedAt: true } } },
        })
        expect(mocks.createAssignment).toHaveBeenCalledWith({ data: {
          studentEnrollmentId: 'enrollment-1', mentorUserId: 'sarah', assignedById: 'leader-1',
        } })
        expect(mocks.updateUser).toHaveBeenCalledWith({ where: { id: 'sarah' }, data: { role: UserRole.MENTOR } })
      })

      it('allows a priest to assign a mentor', async () => {
        mocks.requireAuth.mockResolvedValue({ id: 'priest', role: UserRole.PRIEST })
        expect((await run('sarah')).status).toBe(operation === 'create' ? 201 : 200)
        expect(mocks.transaction).toHaveBeenCalled()
      })

      it.each([
        { role: UserRole.SERVANT, isDisabled: true, roleAssignments: [staffTag] },
        { role: UserRole.MENTOR, isDisabled: false, roleAssignments: [{ ...staffTag, revokedAt: new Date() }] },
        { role: UserRole.STUDENT, isDisabled: false, roleAssignments: [{ tag: RoleTag.SERVANTS_PREP_STUDENT, revokedAt: null }] },
        null,
      ])('rejects an ineligible mentor before saving: %j', async candidate => {
        mocks.candidate.mockResolvedValue(candidate)
        const response = await run('sarah')
        expect(response.status).toBe(400)
        expect(mocks.transaction).not.toHaveBeenCalled()
      })

      it.each([UserRole.SERVANT, UserRole.STUDENT, UserRole.MENTOR])(
        'does not let a %s assign mentors', async role => {
          mocks.requireAuth.mockResolvedValue({ id: 'actor-1', role })
          expect((await run('sarah')).status).toBe(403)
          expect(mocks.transaction).not.toHaveBeenCalled()
        }
      )
    })
  }

  it('updates both mentors when reassigning a student', async () => {
    mocks.currentEnrollment.mockResolvedValue({ mentorId: 'old-mentor' })
    mocks.compatibilityUser.mockResolvedValueOnce({
      role: UserRole.MENTOR, roleAssignments: [staffTag], mentorAssignments: [],
    })
    expect((await operations.update('sarah')).status).toBe(200)
    expect(mocks.endAssignments).toHaveBeenCalled()
    expect(mocks.updateUser).toHaveBeenCalledWith({ where: { id: 'old-mentor' }, data: { role: UserRole.SERVANT } })
    expect(mocks.updateUser).toHaveBeenCalledWith({ where: { id: 'sarah' }, data: { role: UserRole.MENTOR } })
  })

  it('removes derived access when the admin removes the final mentee', async () => {
    mocks.currentEnrollment.mockResolvedValue({ mentorId: 'sarah' })
    mocks.compatibilityUser.mockResolvedValue({
      role: UserRole.MENTOR, roleAssignments: [staffTag], mentorAssignments: [],
    })
    expect((await operations.update(null)).status).toBe(200)
    expect(mocks.createAssignment).not.toHaveBeenCalled()
    expect(mocks.updateUser).toHaveBeenCalledWith({ where: { id: 'sarah' }, data: { role: UserRole.SERVANT } })
  })
})
