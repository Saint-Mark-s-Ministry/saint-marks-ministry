import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { deleteUserWithRelations, UserDeletionConflictError } from '@/lib/user-deletion'

const mocks = {
  countPriestNotes: vi.fn(),
  countRosterImports: vi.fn(),
  findEnrollment: vi.fn(), assignments: vi.fn(), mentor: vi.fn(), updateMentor: vi.fn(),
  deleteMentorAssignments: vi.fn(),
  deleteGuardianLinks: vi.fn(),
  deleteRoleAssignments: vi.fn(),
  deleteUser: vi.fn(),
}

const tx = {
  sundaySchoolPriestNote: { count: mocks.countPriestNotes },
  sundaySchoolRosterImport: { count: mocks.countRosterImports },
  studentEnrollment: { findUnique: mocks.findEnrollment },
  mentorAssignment: { deleteMany: mocks.deleteMentorAssignments, findMany: mocks.assignments },
  sundaySchoolChildGuardian: { deleteMany: mocks.deleteGuardianLinks },
  userRoleAssignment: { deleteMany: mocks.deleteRoleAssignments },
  user: { delete: mocks.deleteUser, findUniqueOrThrow: mocks.mentor, update: mocks.updateMentor },
} as unknown as Prisma.TransactionClient

describe('deleteUserWithRelations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.assignments.mockResolvedValue([])
    mocks.countPriestNotes.mockResolvedValue(0)
    mocks.countRosterImports.mockResolvedValue(0)
    mocks.findEnrollment.mockResolvedValue({ id: 'enrollment-1' })
    mocks.deleteMentorAssignments.mockResolvedValue({ count: 2 })
    mocks.deleteGuardianLinks.mockResolvedValue({ count: 1 })
    mocks.deleteRoleAssignments.mockResolvedValue({ count: 1 })
    mocks.deleteUser.mockResolvedValue({ id: 'user-1' })
  })

  it('removes restrictive account assignments before deleting the user', async () => {
    await deleteUserWithRelations(tx, 'user-1')

    expect(mocks.deleteMentorAssignments).toHaveBeenCalledWith({
      where: {
        OR: [
          { mentorUserId: 'user-1' },
          { studentEnrollmentId: 'enrollment-1' },
        ],
      },
    })
    expect(mocks.deleteGuardianLinks).toHaveBeenCalledWith({ where: { parentId: 'user-1' } })
    expect(mocks.deleteRoleAssignments).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
    expect(mocks.deleteUser).toHaveBeenCalledWith({ where: { id: 'user-1' } })
  })

  it('revokes derived mentor access when deleting the final mentee', async () => {
    mocks.assignments.mockResolvedValue([{ mentorUserId: 'mentor' }])
    mocks.mentor.mockResolvedValue({ role: 'MENTOR', roleAssignments: [{ tag: 'SUNDAY_SCHOOL_SERVANT' }], mentorAssignments: [] })
    await deleteUserWithRelations(tx, 'user-1')
    expect(mocks.updateMentor).toHaveBeenCalledWith({ where: { id: 'mentor' }, data: { role: 'SERVANT' } })
    expect(mocks.updateMentor.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.deleteUser.mock.invocationCallOrder[0])
  })

  it('does not erase protected pastoral or import history', async () => {
    mocks.countPriestNotes.mockResolvedValue(2)
    mocks.countRosterImports.mockResolvedValue(1)

    await expect(deleteUserWithRelations(tx, 'user-1')).rejects.toEqual(
      new UserDeletionConflictError(
        'This user cannot be deleted because they have confidential priest notes and Sunday School roster import history. Disable the account instead to preserve this history.',
      ),
    )
    expect(mocks.deleteMentorAssignments).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('handles users without a student enrollment', async () => {
    mocks.findEnrollment.mockResolvedValue(null)

    await deleteUserWithRelations(tx, 'user-1')

    expect(mocks.deleteMentorAssignments).toHaveBeenCalledWith({
      where: { OR: [{ mentorUserId: 'user-1' }] },
    })
  })
})
