import { describe, expect, it } from 'vitest'
import { RoleTag, UserRole } from '@prisma/client'
import { legacyRoleForTags, roleTagForLegacyRole } from '@/lib/role-tags'

describe('role tag compatibility mapping', () => {
  it('maps every legacy permanent role to its normalized tag', () => {
    expect(roleTagForLegacyRole(UserRole.SUPER_ADMIN)).toBe(RoleTag.SUPER_ADMIN)
    expect(roleTagForLegacyRole(UserRole.PRIEST)).toBe(RoleTag.PRIEST)
    expect(roleTagForLegacyRole(UserRole.SERVANT_PREP)).toBe(RoleTag.SERVANTS_PREP_SERVANT)
    expect(roleTagForLegacyRole(UserRole.STUDENT)).toBe(RoleTag.SERVANTS_PREP_STUDENT)
    expect(roleTagForLegacyRole(UserRole.SERVANT)).toBe(RoleTag.SUNDAY_SCHOOL_SERVANT)
    expect(roleTagForLegacyRole(UserRole.PARENT)).toBe(RoleTag.PARENT)
    expect(roleTagForLegacyRole(UserRole.MENTOR)).toBeNull()
  })

  it('uses Servants Prep Servant as the compatibility role for a cross-program servant', () => {
    expect(legacyRoleForTags([
      RoleTag.SUNDAY_SCHOOL_SERVANT,
      RoleTag.SERVANTS_PREP_SERVANT,
    ], UserRole.SERVANT)).toBe(UserRole.SERVANT_PREP)
  })

  it('activates Super Admin compatibility access when that tag is added', () => {
    expect(legacyRoleForTags([
      RoleTag.SUNDAY_SCHOOL_SERVANT,
      RoleTag.SUPER_ADMIN,
    ], UserRole.SERVANT)).toBe(UserRole.SUPER_ADMIN)
  })

  it('makes Priest read-only override all other compatibility roles', () => {
    expect(legacyRoleForTags([
      RoleTag.SUPER_ADMIN,
      RoleTag.PRIEST,
      RoleTag.SERVANTS_PREP_SERVANT,
    ], UserRole.SUPER_ADMIN)).toBe(UserRole.PRIEST)
  })

  it('preserves mentor-only compatibility because mentor is assignment-derived', () => {
    expect(legacyRoleForTags([], UserRole.MENTOR)).toBe(UserRole.MENTOR)
  })

  it('keeps an active mentor on the mentor dashboard when Sunday School is added', () => {
    expect(legacyRoleForTags(
      [RoleTag.SUNDAY_SCHOOL_SERVANT],
      UserRole.SERVANT,
      { hasActiveMentorAssignment: true }
    )).toBe(UserRole.MENTOR)
  })

  it('uses the Sunday School dashboard after the last mentor assignment ends', () => {
    expect(legacyRoleForTags(
      [RoleTag.SUNDAY_SCHOOL_SERVANT],
      UserRole.MENTOR,
      { hasActiveMentorAssignment: false }
    )).toBe(UserRole.SERVANT)
  })
})
