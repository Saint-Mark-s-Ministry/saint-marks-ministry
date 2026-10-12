import { describe, expect, it } from 'vitest'
import { SundaySchoolLevel } from '@prisma/client'
import { ROTATION_LEVELS, allRotationWeeksVerified, completedRotationLevels, nextRotationLevel, nextRotationStart, rotationCanSubmit } from '@/lib/rotation-forms'
import { rotationRequirementMet, rotationAttendancePercentage } from '@/lib/sunday-school-utils'

describe('four-week grade rotation rules', () => {
  it('does not complete a rotation at three weeks or by excusing its fourth week', () => {
    const three = [1, 2, 3].map(weekNumber => ({ weekNumber, status: 'MANUAL' }))
    expect(allRotationWeeksVerified(three)).toBe(false)
    expect(allRotationWeeksVerified([...three, { weekNumber: 4, status: 'EXCUSED' }])).toBe(false)
    expect(allRotationWeeksVerified([...three, { weekNumber: 4, status: 'MANUAL' }])).toBe(true)
  })

  it('waits until the fourth rotation week before accepting evidence', () => {
    expect(rotationCanSubmit('2026-09-06T00:00:00Z', new Date('2026-09-26T23:59:59Z'))).toBe(false)
    expect(rotationCanSubmit('2026-09-06T00:00:00Z', new Date('2026-09-27T00:00:00Z'))).toBe(true)
  })

  it('advances a whole grade, wraps after eighth grade, and visits all ten grades from any start', () => {
    expect(nextRotationLevel(SundaySchoolLevel.GRADE_2)).toBe(SundaySchoolLevel.GRADE_3)
    expect(nextRotationLevel(SundaySchoolLevel.GRADE_8)).toBe(SundaySchoolLevel.PRE_K)
    for (const start of ROTATION_LEVELS) {
      let level: SundaySchoolLevel = start
      const visited = new Set<SundaySchoolLevel>()
      for (let step = 0; step < 10; step++) { visited.add(level); level = nextRotationLevel(level) }
      expect(visited.size).toBe(10)
      expect(level).toBe(start)
    }
    expect(() => nextRotationLevel(SundaySchoolLevel.GRADE_9)).toThrow()
  })

  it('counts each approved grade once and does not count pending or rejected uploads', () => {
    const approved = { class: { level: SundaySchoolLevel.KINDERGARTEN }, rotationForm: { status: 'APPROVED' } }
    expect(completedRotationLevels([approved, approved, { class: { level: SundaySchoolLevel.GRADE_1 }, rotationForm: { status: 'PENDING' } }]).size).toBe(1)
  })

  it('requires all ten approved grades for serving eligibility, including finished rotations', () => {
    const rotations = ROTATION_LEVELS.map(level => ({ class: { level }, rotationForm: { status: 'APPROVED' }, isActive: false, attendance: null, yearLevel: null }))
    expect(rotationRequirementMet(rotations.slice(0, 9), null).met).toBe(false)
    expect(rotationRequirementMet(rotations, null).met).toBe(true)
    expect(rotationAttendancePercentage(rotations.slice(0, 3))).toBe(30)
    expect(rotationAttendancePercentage(rotations)).toBe(100)
  })

  it('starts the next rotation after the prior four weeks, using the current serving week if approval is delayed', () => {
    expect(nextRotationStart('2026-09-06', new Date('2026-09-27T14:00:00Z')).toISOString()).toBe('2026-10-04T00:00:00.000Z')
    expect(nextRotationStart('2026-09-06', new Date('2026-10-10T12:00:00Z')).toISOString()).toBe('2026-10-04T00:00:00.000Z')
  })
})
