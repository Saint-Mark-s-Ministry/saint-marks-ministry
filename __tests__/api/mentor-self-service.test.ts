import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), transaction: vi.fn(), count: vi.fn(), student: vi.fn(), enrollment: vi.fn(),
  save: vi.fn(), assignment: vi.fn(), createAssignment: vi.fn(), endAssignments: vi.fn(),
  mentor: vi.fn(), updateMentor: vi.fn(), annual: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }))
import { POST as assign } from '@/app/api/enrollments/self-assign/route'
import { POST as unassign } from '@/app/api/enrollments/unassign-mentor/route'

const tx = {
  user: { findUnique: mocks.student, findUniqueOrThrow: mocks.mentor, update: mocks.updateMentor },
  studentEnrollment: { count: mocks.count, findUnique: mocks.enrollment, update: mocks.save, create: mocks.save },
  mentorAssignment: { findFirst: mocks.assignment, create: mocks.createAssignment, updateMany: mocks.endAssignments },
  annualMentorInformation: { findFirst: mocks.annual },
}
const request = () => new Request('http://localhost/api/enrollments', {
  method: 'POST', body: JSON.stringify({ studentId: 'student' }),
})

describe('mentor self-service scope and dashboard access', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.auth.mockResolvedValue({ id: 'mentor', role: 'MENTOR' })
    mocks.transaction.mockImplementation(async callback => callback(tx))
    mocks.count.mockResolvedValue(1)
    mocks.student.mockResolvedValue({ role: 'STUDENT' })
    mocks.enrollment.mockResolvedValue({ id: 'enrollment', mentorId: 'mentor', yearLevel: 'YEAR_1', isActive: true })
    mocks.save.mockResolvedValue({ id: 'enrollment', studentId: 'student' })
    mocks.mentor.mockResolvedValue({ role: 'MENTOR', roleAssignments: [{ tag: 'SUNDAY_SCHOOL_SERVANT' }], mentorAssignments: [] })
    mocks.assignment.mockResolvedValue(null)
  })

  it.each([true, false])('creates durable scope for self-assignment (existing enrollment: %s)', async existing => {
    if (!existing) mocks.enrollment.mockResolvedValue(null)
    mocks.mentor.mockResolvedValue({ role: 'MENTOR', roleAssignments: [{ tag: 'SUNDAY_SCHOOL_SERVANT' }], mentorAssignments: [{ id: 'assignment' }] })
    expect((await assign(request())).status).toBe(200)
    expect(mocks.createAssignment).toHaveBeenCalledWith({ data: {
      studentEnrollmentId: 'enrollment', mentorUserId: 'mentor', assignedById: 'mentor',
    } })
    expect(mocks.updateMentor).not.toHaveBeenCalled()
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' })
  })

  it('does not duplicate the durable assignment on repeated saves', async () => {
    mocks.assignment.mockResolvedValue({ id: 'assignment' })
    expect((await assign(request())).status).toBe(200)
    expect(mocks.createAssignment).not.toHaveBeenCalled()
  })

  it('removes durable scope and mentor access when the final mentee is unassigned', async () => {
    expect((await unassign(request())).status).toBe(200)
    expect(mocks.endAssignments).toHaveBeenCalledWith({
      where: { studentEnrollmentId: 'enrollment', endedAt: null },
      data: { endedAt: expect.any(Date), endedById: 'mentor', endReason: 'Mentor removed themselves' },
    })
    expect(mocks.updateMentor).toHaveBeenCalledWith({ where: { id: 'mentor' }, data: { role: 'SERVANT' } })
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ data: { mentorId: null, mentorName: null, mentorPhone: null } }))
  })

  it('keeps mentor access when another active mentee remains', async () => {
    mocks.mentor.mockResolvedValue({ role: 'MENTOR', roleAssignments: [{ tag: 'SUNDAY_SCHOOL_SERVANT' }], mentorAssignments: [{ id: 'other-assignment' }] })
    expect((await unassign(request())).status).toBe(200)
    expect(mocks.updateMentor).not.toHaveBeenCalled()
  })

  it.each([assign, unassign])('rejects assignments belonging to another mentor', async run => {
    mocks.enrollment.mockResolvedValue({ id: 'enrollment', mentorId: 'other-mentor' })
    expect([403, 409]).toContain((await run(request())).status)
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.endAssignments).not.toHaveBeenCalled()
    expect(mocks.createAssignment).not.toHaveBeenCalled()
  })

  it('does not let an unassigned Sunday School servant claim students', async () => {
    mocks.auth.mockResolvedValue({ id: 'servant', role: 'SERVANT' })
    expect((await assign(request())).status).toBe(403)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('preserves the Year 2 renewal requirement', async () => {
    mocks.enrollment.mockResolvedValue({ id: 'enrollment', mentorId: null, yearLevel: 'YEAR_2', isActive: true })
    mocks.annual.mockResolvedValue(null)
    expect((await assign(request())).status).toBe(409)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('reports conflicting concurrent changes without a partial save', async () => {
    mocks.transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Conflict', { code: 'P2034', clientVersion: '6.19.3' }))
    expect((await unassign(request())).status).toBe(409)
  })
})
