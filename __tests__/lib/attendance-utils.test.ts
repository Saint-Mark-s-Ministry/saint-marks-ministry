import { describe, it, expect } from 'vitest'
import { AttendanceStatus } from '@prisma/client'
import {
  calculateAttendancePercentage,
  calculateAttendanceFromRecords,
  countAttendanceStatuses,
  meetsAttendanceRequirement,
  getAttendanceStatusLabel,
  calculateEffectiveAbsences,
  calculateAbsencesAllowed,
  isGraduationEligible,
  type AttendanceCounts,
} from '@/lib/attendance-utils'

describe('calculateAttendancePercentage', () => {
  it('should return 100% when all present', () => {
    expect(calculateAttendancePercentage({ present: 10, late: 0, absent: 0, excused: 0 })).toBe(100)
  })

  it('should return 50% when all late (lates/2 rule)', () => {
    expect(calculateAttendancePercentage({ present: 0, late: 10, absent: 0, excused: 0 })).toBe(50)
  })

  it('should handle mixed present and late', () => {
    // (5 + 4/2) / 10 = 7/10 = 70%
    expect(calculateAttendancePercentage({ present: 5, late: 4, absent: 1, excused: 0 })).toBe(70)
  })

  it('should exclude excused from denominator', () => {
    // countable = 10 - 2 = 8, effective = 7/8 = 87.5%
    expect(calculateAttendancePercentage({ present: 7, late: 0, absent: 1, excused: 2 })).toBe(87.5)
  })

  it('should return null when all lessons are excused', () => {
    expect(calculateAttendancePercentage({ present: 0, late: 0, absent: 0, excused: 5 })).toBeNull()
  })

  it('should return null when total is zero', () => {
    expect(calculateAttendancePercentage({ present: 0, late: 0, absent: 0, excused: 0 })).toBeNull()
  })

  it('should return 0% when all absent', () => {
    expect(calculateAttendancePercentage({ present: 0, late: 0, absent: 10, excused: 0 })).toBe(0)
  })

  it('should handle exactly 75% boundary', () => {
    // (6 + 0/2) / 8 = 6/8 = 75%
    expect(calculateAttendancePercentage({ present: 6, late: 0, absent: 2, excused: 0 })).toBe(75)
  })

  it('should handle just below 75% boundary', () => {
    // (7 + 1/2) / 10 = 7.5/10 = 75% exactly — need true below
    // (5 + 4/2) / 10 = 7/10 = 70% — below
    // Let's compute: 3P + 0L + 1A + 0E → 3/4 = 75%. Need just below:
    // 74/100 = 74%... use (74 + 0/2) / 100 = 74
    const result = calculateAttendancePercentage({ present: 74, late: 0, absent: 26, excused: 0 })
    expect(result).toBe(74)
    expect(result).toBeLessThan(75)
  })

  it('should handle single present lesson', () => {
    expect(calculateAttendancePercentage({ present: 1, late: 0, absent: 0, excused: 0 })).toBe(100)
  })

  it('should handle single late lesson', () => {
    expect(calculateAttendancePercentage({ present: 0, late: 1, absent: 0, excused: 0 })).toBe(50)
  })

  it('should compute lates correctly: 2 lates = 1 absence equivalent', () => {
    // 0P + 2L + 0A → effective = 1/2 = 50%
    expect(calculateAttendancePercentage({ present: 0, late: 2, absent: 0, excused: 0 })).toBe(50)
    // 8P + 2L + 0A → effective = (8+1)/10 = 90%
    expect(calculateAttendancePercentage({ present: 8, late: 2, absent: 0, excused: 0 })).toBe(90)
  })
})

describe('countAttendanceStatuses', () => {
  it('should count empty array', () => {
    expect(countAttendanceStatuses([])).toEqual({ present: 0, late: 0, absent: 0, excused: 0 })
  })

  it('should count single status', () => {
    const records = [{ status: AttendanceStatus.PRESENT }]
    expect(countAttendanceStatuses(records)).toEqual({ present: 1, late: 0, absent: 0, excused: 0 })
  })

  it('should count mixed statuses correctly', () => {
    const records = [
      { status: AttendanceStatus.PRESENT },
      { status: AttendanceStatus.PRESENT },
      { status: AttendanceStatus.LATE },
      { status: AttendanceStatus.ABSENT },
      { status: AttendanceStatus.EXCUSED },
      { status: AttendanceStatus.EXCUSED },
    ]
    expect(countAttendanceStatuses(records)).toEqual({ present: 2, late: 1, absent: 1, excused: 2 })
  })

  it('should count all of one type', () => {
    const records = Array(5).fill({ status: AttendanceStatus.LATE })
    expect(countAttendanceStatuses(records)).toEqual({ present: 0, late: 5, absent: 0, excused: 0 })
  })
})

describe('calculateAttendanceFromRecords', () => {
  it('should return null for empty records', () => {
    expect(calculateAttendanceFromRecords([])).toBeNull()
  })

  it('should calculate from mixed records', () => {
    const records = [
      { status: AttendanceStatus.PRESENT },
      { status: AttendanceStatus.PRESENT },
      { status: AttendanceStatus.LATE },
      { status: AttendanceStatus.LATE },
      { status: AttendanceStatus.ABSENT },
    ]
    // (2 + 2/2) / 5 = 3/5 = 60%
    expect(calculateAttendanceFromRecords(records)).toBe(60)
  })

  it('should handle all excused records', () => {
    const records = [
      { status: AttendanceStatus.EXCUSED },
      { status: AttendanceStatus.EXCUSED },
    ]
    expect(calculateAttendanceFromRecords(records)).toBeNull()
  })
})

describe('meetsAttendanceRequirement', () => {
  it('should return true for 75%', () => {
    expect(meetsAttendanceRequirement(75)).toBe(true)
  })

  it('should return true for above 75%', () => {
    expect(meetsAttendanceRequirement(100)).toBe(true)
    expect(meetsAttendanceRequirement(75.1)).toBe(true)
  })

  it('should return false for below 75%', () => {
    expect(meetsAttendanceRequirement(74.9)).toBe(false)
    expect(meetsAttendanceRequirement(0)).toBe(false)
  })

  it('should return false for null (no countable lessons)', () => {
    expect(meetsAttendanceRequirement(null)).toBe(false)
  })
})

describe('getAttendanceStatusLabel', () => {
  it('should return correct label for each status', () => {
    expect(getAttendanceStatusLabel(AttendanceStatus.PRESENT)).toBe('Present')
    expect(getAttendanceStatusLabel(AttendanceStatus.LATE)).toBe('Late')
    expect(getAttendanceStatusLabel(AttendanceStatus.ABSENT)).toBe('Absent')
    expect(getAttendanceStatusLabel(AttendanceStatus.EXCUSED)).toBe('Excused')
  })
})

describe('calculateEffectiveAbsences', () => {
  it('should count absences directly', () => {
    expect(calculateEffectiveAbsences({ present: 5, late: 0, absent: 3, excused: 0 })).toBe(3)
  })

  it('should count 2 lates as 1 effective absence', () => {
    expect(calculateEffectiveAbsences({ present: 5, late: 2, absent: 0, excused: 0 })).toBe(1)
  })

  it('should combine absences and half-lates', () => {
    // 2 absent + 3 late/2 = 2 + 1.5 = 3.5
    expect(calculateEffectiveAbsences({ present: 5, late: 3, absent: 2, excused: 0 })).toBe(3.5)
  })

  it('should return 0 for all present/excused', () => {
    expect(calculateEffectiveAbsences({ present: 10, late: 0, absent: 0, excused: 5 })).toBe(0)
  })

  it('should handle odd number of lates', () => {
    // 1 late / 2 = 0.5
    expect(calculateEffectiveAbsences({ present: 9, late: 1, absent: 0, excused: 0 })).toBe(0.5)
  })
})

describe('calculateAbsencesAllowed', () => {
  it('should allow absences when student is doing well', () => {
    // 10 present, 0 late, 0 absent, 0 excused, 10 remaining
    // futurePresentNeeded = 0.75 * (10 + 10) = 15
    // allowed = 10 + 10 - 15 = 5
    const counts: AttendanceCounts = { present: 10, late: 0, absent: 0, excused: 0 }
    expect(calculateAbsencesAllowed(counts, 10)).toBe(5)
  })

  it('should return negative when student is already below threshold', () => {
    // 2 present, 0 late, 8 absent, 0 excused, 0 remaining
    // futurePresentNeeded = 0.75 * (10 + 0) = 7.5
    // allowed = 2 + 0 - 7.5 = -5.5 → floor = -6
    const counts: AttendanceCounts = { present: 2, late: 0, absent: 8, excused: 0 }
    expect(calculateAbsencesAllowed(counts, 0)).toBe(-6)
  })

  it('should return 0 when student is exactly at boundary with no remaining lessons', () => {
    // 3 present, 0 late, 1 absent, 0 excused, 0 remaining
    // futurePresentNeeded = 0.75 * (4 + 0) = 3
    // allowed = 3 + 0 - 3 = 0
    const counts: AttendanceCounts = { present: 3, late: 0, absent: 1, excused: 0 }
    expect(calculateAbsencesAllowed(counts, 0)).toBe(0)
  })

  it('should account for lates in effective present calculation', () => {
    // 8 present, 2 late, 0 absent, 0 excused, 10 remaining
    // effectivePresent = 8 + 1 = 9, countable = 10
    // futurePresentNeeded = 0.75 * (10 + 10) = 15
    // allowed = 9 + 10 - 15 = 4
    const counts: AttendanceCounts = { present: 8, late: 2, absent: 0, excused: 0 }
    expect(calculateAbsencesAllowed(counts, 10)).toBe(4)
  })

  it('should floor the result', () => {
    // 7 present, 1 late, 2 absent, 0 excused, 5 remaining
    // effectivePresent = 7.5, countable = 10
    // futurePresentNeeded = 0.75 * 15 = 11.25
    // allowed = 7.5 + 5 - 11.25 = 1.25 → floor = 1
    const counts: AttendanceCounts = { present: 7, late: 1, absent: 2, excused: 0 }
    expect(calculateAbsencesAllowed(counts, 5)).toBe(1)
  })

  it('should handle excused lessons correctly', () => {
    // 7 present, 0 late, 1 absent, 2 excused, 5 remaining
    // effectivePresent = 7, countable = 10 - 2 = 8
    // futurePresentNeeded = 0.75 * (8 + 5) = 9.75
    // allowed = 7 + 5 - 9.75 = 2.25 → floor = 2
    const counts: AttendanceCounts = { present: 7, late: 0, absent: 1, excused: 2 }
    expect(calculateAbsencesAllowed(counts, 5)).toBe(2)
  })
})

describe('isGraduationEligible', () => {
  const met = [true, true, true, true]
  it('is false for a student with no attendance or exam data', () => {
    expect(isGraduationEligible({ attendancePercentage: null, examAverage: null, requirementsMet: met })).toBe(false)
    expect(isGraduationEligible({ attendancePercentage: 90, examAverage: null, requirementsMet: met })).toBe(false)
    expect(isGraduationEligible({ attendancePercentage: null, examAverage: 90, requirementsMet: met })).toBe(false)
  })
  it('requires every requirement once data exists', () => {
    expect(isGraduationEligible({ attendancePercentage: 90, examAverage: 90, requirementsMet: met })).toBe(true)
    expect(isGraduationEligible({ attendancePercentage: 90, examAverage: 90, requirementsMet: [true, false, true, true] })).toBe(false)
  })
})
