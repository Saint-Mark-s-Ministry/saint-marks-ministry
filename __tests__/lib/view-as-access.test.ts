import { describe, expect, it } from 'vitest'
import { RoleTag, UserRole } from '@prisma/client'
import { hasViewAsAccess } from '@/lib/view-as-access'
const priest = { role: UserRole.PRIEST, isDisabled: false, canUseViewAs: true, roleAssignments: [{ tag: RoleTag.PRIEST }] }
describe('View as access', () => {
  it('allows an explicitly enabled active priest', () => expect(hasViewAsAccess(priest)).toBe(true))
  it.each([
    null,
    { ...priest, canUseViewAs: false },
    { ...priest, canUseViewAs: undefined },
    { ...priest, isDisabled: true },
    { ...priest, mustChangePassword: true },
  ])('denies missing, ungranted, disabled, or password-gated principals: %j', actor => expect(hasViewAsAccess(actor)).toBe(false))
  it.each(Object.values(UserRole))('allows an explicit grant for %s without ministry tags', role => {
    expect(hasViewAsAccess({ role, isDisabled: false, canUseViewAs: true, roleAssignments: [] })).toBe(true)
    expect(hasViewAsAccess({ role, isDisabled: false, canUseViewAs: false, roleAssignments: [] })).toBe(false)
  })
  it('preserves active Super Admin access without the optional flag', () => {
    expect(hasViewAsAccess({ role: UserRole.SUPER_ADMIN, isDisabled: false, roleAssignments: [{ tag: RoleTag.SUPER_ADMIN }] })).toBe(true)
    expect(hasViewAsAccess({ role: UserRole.SUPER_ADMIN, isDisabled: false, roleAssignments: [] })).toBe(false)
  })
})
