import { describe, expect, it } from 'vitest'
import { RoleTag } from '@prisma/client'
import { canViewPrepGuides } from '@/lib/sp-guide-access'

describe('SP guide audience', () => {
  it.each(Object.values(RoleTag))('checks %s against the exact staff allowlist', tag => {
    expect(canViewPrepGuides(new Set([tag]))).toBe([
      RoleTag.SUPER_ADMIN, RoleTag.PRIEST, RoleTag.SERVANTS_PREP_SERVANT,
    ].some(allowed => allowed === tag))
  })
  it('denies missing tags and allows a person with an additional SP staff role', () => {
    expect(canViewPrepGuides(new Set())).toBe(false)
    expect(canViewPrepGuides(new Set([RoleTag.SUNDAY_SCHOOL_SERVANT, RoleTag.SERVANTS_PREP_SERVANT]))).toBe(true)
  })
})
