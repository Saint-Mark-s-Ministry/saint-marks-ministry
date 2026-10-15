import { describe, expect, it } from 'vitest'
import { RoleTag, UserRole } from '@prisma/client'
import { isEligibleMentorAccount, type MentorCandidate } from '@/lib/mentor-eligibility'
import { canManageData, canAssignMentors } from '@/lib/roles'

function candidate(tags: RoleTag[], overrides: Partial<MentorCandidate> = {}): MentorCandidate {
  return {
    role: UserRole.SERVANT,
    isDisabled: false,
    roleAssignments: tags.map(tag => ({ tag, revokedAt: null })),
    ...overrides,
  }
}

describe('mentor account eligibility', () => {
  it.each([
    RoleTag.SUPER_ADMIN,
    RoleTag.PRIEST,
    RoleTag.SERVANTS_PREP_SERVANT,
    RoleTag.SUNDAY_SCHOOL_SERVANT,
  ])('accepts an enabled account with the %s tag regardless of legacy role', tag => {
    expect(isEligibleMentorAccount(candidate([tag]))).toBe(true)
    expect(isEligibleMentorAccount(candidate([tag], { isDisabled: true }))).toBe(false)
  })

  it('allows a Sunday School servant to be selected without granting prep administration', () => {
    const servant = candidate([RoleTag.SUNDAY_SCHOOL_SERVANT])
    expect(isEligibleMentorAccount(servant)).toBe(true)
    expect(canManageData(servant.role)).toBe(false)
    expect(canAssignMentors(servant.role)).toBe(false)
  })

  it.each([RoleTag.PARENT, RoleTag.SERVANTS_PREP_STUDENT, RoleTag.SUNDAY_SCHOOL_STUDENT])(
    'rejects %s-only accounts even if the legacy role is still staff', tag => {
      expect(isEligibleMentorAccount(candidate([tag], { role: UserRole.MENTOR }))).toBe(false)
    }
  )

  it('accepts a staff tag alongside student and parent tags', () => {
    expect(isEligibleMentorAccount(candidate([
      RoleTag.SERVANTS_PREP_STUDENT, RoleTag.PARENT, RoleTag.SUNDAY_SCHOOL_SERVANT,
    ], { role: UserRole.STUDENT }))).toBe(true)
  })

  it('rejects revoked staff tags even when the legacy role is still eligible', () => {
    expect(isEligibleMentorAccount(candidate([], {
      role: UserRole.MENTOR,
      roleAssignments: [{ tag: RoleTag.SUNDAY_SCHOOL_SERVANT, revokedAt: new Date() }],
    }))).toBe(false)
  })

  it.each([UserRole.PRIEST, UserRole.SUPER_ADMIN, UserRole.SERVANT_PREP, UserRole.MENTOR])(
    'preserves never-tagged legacy %s accounts during migration', role => {
      expect(isEligibleMentorAccount(candidate([], { role }))).toBe(true)
    }
  )

  it('rejects missing accounts and untagged students, parents, and servants', () => {
    expect(isEligibleMentorAccount(null)).toBe(false)
    for (const role of [UserRole.STUDENT, UserRole.PARENT, UserRole.SERVANT]) {
      expect(isEligibleMentorAccount(candidate([], { role }))).toBe(false)
    }
  })
})
