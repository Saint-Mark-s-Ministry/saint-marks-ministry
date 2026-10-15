import { describe, expect, it, vi } from 'vitest'
import { RoleTag, UserRole, type Prisma } from '@prisma/client'
import { syncMentorCompatibilityRoles } from '@/lib/mentor-assignments'

function transactionUser(role: UserRole, tags: RoleTag[], hasMentees: boolean) {
  const update = vi.fn().mockResolvedValue({})
  const tx = { user: {
    findUniqueOrThrow: vi.fn().mockResolvedValue({
      role,
      roleAssignments: tags.map(tag => ({ tag })),
      mentorAssignments: hasMentees ? [{ id: 'assignment-1' }] : [],
    }),
    update,
  } }
  return { tx: tx as unknown as Prisma.TransactionClient, update, find: tx.user.findUniqueOrThrow }
}

describe('mentor compatibility roles', () => {
  it('activates limited mentor access for a Sunday School servant after assignment', async () => {
    const { tx, update, find } = transactionUser(UserRole.SERVANT, [RoleTag.SUNDAY_SCHOOL_SERVANT], true)
    await syncMentorCompatibilityRoles(tx, ['sarah', 'sarah'])
    expect(update).toHaveBeenCalledExactlyOnceWith({ where: { id: 'sarah' }, data: { role: UserRole.MENTOR } })
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({
      roleAssignments: { where: { revokedAt: null }, select: { tag: true } },
      mentorAssignments: {
        where: { endedAt: null, studentEnrollment: { status: 'ACTIVE' } },
        select: { id: true }, take: 1,
      },
    }) }))
  })

  it('returns to Sunday School access after the final active mentee is removed', async () => {
    const { tx, update } = transactionUser(UserRole.MENTOR, [RoleTag.SUNDAY_SCHOOL_SERVANT], false)
    await syncMentorCompatibilityRoles(tx, ['sarah'])
    expect(update).toHaveBeenCalledWith({ where: { id: 'sarah' }, data: { role: UserRole.SERVANT } })
  })

  it.each([
    [UserRole.PRIEST, RoleTag.PRIEST],
    [UserRole.SUPER_ADMIN, RoleTag.SUPER_ADMIN],
    [UserRole.SERVANT_PREP, RoleTag.SERVANTS_PREP_SERVANT],
  ] as const)('preserves %s access rather than replacing it with mentor access', async (role, tag) => {
    const { tx, update } = transactionUser(role, [tag, RoleTag.SUNDAY_SCHOOL_SERVANT], true)
    await syncMentorCompatibilityRoles(tx, ['staff-1'])
    expect(update).not.toHaveBeenCalled()
  })

  it('keeps mentor access while another active mentee remains', async () => {
    const { tx, update } = transactionUser(UserRole.MENTOR, [RoleTag.SUNDAY_SCHOOL_SERVANT], true)
    await syncMentorCompatibilityRoles(tx, ['sarah'])
    expect(update).not.toHaveBeenCalled()
  })
})
