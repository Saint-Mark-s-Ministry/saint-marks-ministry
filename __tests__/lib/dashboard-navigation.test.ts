import { describe, expect, it } from 'vitest'
import { defaultDashboardPath } from '@/lib/dashboard-navigation'

describe('defaultDashboardPath', () => {
  it('routes each account type to its correct home', () => {
    expect(defaultDashboardPath('SERVANT')).toBe('/dashboard/servants')
    expect(defaultDashboardPath('PARENT')).toBe('/dashboard/parent')
    expect(defaultDashboardPath('STUDENT')).toBe('/dashboard/student')
    expect(defaultDashboardPath('MENTOR')).toBe('/dashboard/mentor')
    expect(defaultDashboardPath('SUPER_ADMIN')).toBe('/dashboard/admin')
  })

  it('opens Sunday School for a servant who is not a Servants Prep leader', () => {
    const sundaySchool = { hasAccess: true }
    const ministryMembership = { sundaySchoolServant: true, servantsPrepLeader: false }
    expect(defaultDashboardPath({ role: 'MENTOR', sundaySchool, ministryMembership })).toBe('/dashboard/servants')
    expect(defaultDashboardPath({ role: 'SUPER_ADMIN', sundaySchool, ministryMembership })).toBe('/dashboard/servants')
  })

  it('keeps Prep as the default for its leaders and non-serving mentors', () => {
    const sundaySchool = { hasAccess: true }
    const ministryMembership = { sundaySchoolServant: true, servantsPrepLeader: true }
    expect(defaultDashboardPath({ role: 'SERVANT_PREP', sundaySchool, ministryMembership })).toBe('/dashboard/admin')
    expect(defaultDashboardPath({ role: 'PRIEST', sundaySchool, ministryMembership })).toBe('/dashboard/admin')
    expect(defaultDashboardPath({ role: 'MENTOR', sundaySchool, ministryMembership })).toBe('/dashboard/mentor')
    expect(defaultDashboardPath({ role: 'STUDENT', sundaySchool, ministryMembership: {
      sundaySchoolServant: true, servantsPrepLeader: false,
    } })).toBe('/dashboard/student')
    expect(defaultDashboardPath({
      role: 'MENTOR',
      sundaySchool: { hasAccess: false },
      ministryMembership: { sundaySchoolServant: true, servantsPrepLeader: false },
    })).toBe('/dashboard/mentor')
  })
})
