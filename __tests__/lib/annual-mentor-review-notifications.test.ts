import { describe, expect, it, vi } from 'vitest'
import { RoleTag, type Prisma } from '@prisma/client'
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
import { queueAnnualMentorReview } from '@/lib/annual-mentor-information'

describe('mentor form review notifications', () => {
  it('queues persistent roster links only for enabled staff who can verify, with no mentor contact in the alert', async () => {
    const users = vi.fn().mockResolvedValue([{ id: 'prep-servant' }, { id: 'super-admin' }])
    const clear = vi.fn()
    const create = vi.fn()
    const tx = { user: { findMany: users }, notification: { deleteMany: clear, createMany: create } } as unknown as Prisma.TransactionClient
    await queueAnnualMentorReview(tx, { studentId: 'student 1', studentName: 'Mina', academicYearId: 'year', id: 'form', updatedAt: new Date('2026-10-24T00:00:00Z') })
    expect(users).toHaveBeenCalledWith({ where: {
      isDisabled: false, roleAssignments: {
        some: { tag: { in: [RoleTag.SERVANTS_PREP_SERVANT, RoleTag.SUPER_ADMIN] }, revokedAt: null },
        none: { tag: RoleTag.PRIEST, revokedAt: null },
      },
    }, select: { id: true } })
    expect(clear).toHaveBeenCalledOnce()
    const data = create.mock.calls[0][0].data
    expect(data).toHaveLength(2)
    expect(data[0]).toMatchObject({
      userId: 'prep-servant', isPersistent: true, type: 'ANNOUNCEMENT',
      url: '/dashboard/admin/enrollments?studentId=student%201',
      metadata: { kind: 'annualMentorReview', studentId: 'student 1', academicYearId: 'year' },
    })
    expect(data[1].userId).toBe('super-admin')
    expect(create.mock.calls[0][0].skipDuplicates).toBe(true)
    expect(clear.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0])
  })
})
