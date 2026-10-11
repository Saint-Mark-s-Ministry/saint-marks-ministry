import { describe, it, expect } from 'vitest'
import {
  generateCode,
  parseCodePrefix,
  getWeekStart,
  getCodeValidUntil,
  calculateSSAttendance,
  getAssignmentWeeks,
  getWeekNumber,
  GRADE_DISPLAY_NAMES,
  elapsedRotationWeeks,
  rotationAttendanceToDate,
  rotationRequirementMet,
} from '@/lib/sunday-school-utils'

// Mock SundaySchoolLogStatus since it comes from Prisma
const SundaySchoolLogStatus = {
  VERIFIED: 'VERIFIED',
  MANUAL: 'MANUAL',
  EXCUSED: 'EXCUSED',
  REJECTED: 'REJECTED',
} as const

type SSGrade =
  | 'PRE_K'
  | 'KINDERGARTEN'
  | 'GRADE_1'
  | 'GRADE_2'
  | 'GRADE_3'
  | 'GRADE_4'
  | 'GRADE_5'
  | 'GRADE_6_PLUS'
type SSLogStatus = (typeof SundaySchoolLogStatus)[keyof typeof SundaySchoolLogStatus]

describe('generateCode', () => {
  it('should generate a code with correct prefix for each grade', () => {
    const prefixes: Record<string, string> = {
      PRE_K: 'PK',
      KINDERGARTEN: 'KG',
      GRADE_1: 'G1',
      GRADE_2: 'G2',
      GRADE_3: 'G3',
      GRADE_4: 'G4',
      GRADE_5: 'G5',
      GRADE_6_PLUS: 'G6',
    }

    for (const [grade, expectedPrefix] of Object.entries(prefixes)) {
      const code = generateCode(grade as SSGrade)
      expect(code).toMatch(new RegExp(`^${expectedPrefix}-[A-Z0-9]{4}$`))
    }
  })

  it('should generate unique codes', () => {
    const codes = new Set<string>()
    for (let i = 0; i < 100; i++) {
      codes.add(generateCode('GRADE_2' as SSGrade))
    }
    // With 4 alphanumeric chars, collisions in 100 attempts should be extremely rare
    expect(codes.size).toBeGreaterThan(95)
  })

  it('should only use non-confusable characters', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateCode('PRE_K' as SSGrade)
      const randomPart = code.split('-')[1]
      // Should not contain 0, O, 1, I (L is kept since uppercase L is distinct)
      expect(randomPart).not.toMatch(/[0OI1]/)
    }
  })
})

describe('parseCodePrefix', () => {
  it('should parse valid code prefixes', () => {
    expect(parseCodePrefix('PK-A7X3')).toBe('PRE_K')
    expect(parseCodePrefix('KG-B9M2')).toBe('KINDERGARTEN')
    expect(parseCodePrefix('G1-C8N4')).toBe('GRADE_1')
    expect(parseCodePrefix('G2-D4K8')).toBe('GRADE_2')
    expect(parseCodePrefix('G6-E5J9')).toBe('GRADE_6_PLUS')
  })

  it('should return null for invalid prefixes', () => {
    expect(parseCodePrefix('XX-A7X3')).toBeNull()
    expect(parseCodePrefix('invalid')).toBeNull()
    expect(parseCodePrefix('')).toBeNull()
  })
})

describe('getWeekStart', () => {
  it('should return the Sunday of the current week', () => {
    // Test with a known Wednesday (Jan 15, 2025)
    const wednesday = new Date(2025, 0, 15) // Wed Jan 15
    const result = getWeekStart(wednesday)
    expect(result.getDay()).toBe(0) // Sunday
    expect(result.getDate()).toBe(12) // Jan 12
  })

  it('should return the same date if already a Sunday', () => {
    const sunday = new Date(2025, 0, 12) // Sun Jan 12
    const result = getWeekStart(sunday)
    expect(result.getDay()).toBe(0)
    expect(result.getDate()).toBe(12)
  })

  it('should set time to midnight', () => {
    const result = getWeekStart(new Date(2025, 0, 15, 14, 30, 0))
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
  })
})

describe('getCodeValidUntil', () => {
  it('should return 7 days after weekOf at end of day', () => {
    const weekOf = new Date(2025, 0, 12) // Sun Jan 12
    const validUntil = getCodeValidUntil(weekOf)
    expect(validUntil.getDate()).toBe(19) // Jan 19
    expect(validUntil.getHours()).toBe(23)
    expect(validUntil.getMinutes()).toBe(59)
  })
})

describe('calculateSSAttendance', () => {
  it('should calculate correct percentage for all verified', () => {
    const logs = [
      { status: SundaySchoolLogStatus.VERIFIED as SSLogStatus },
      { status: SundaySchoolLogStatus.VERIFIED as SSLogStatus },
      { status: SundaySchoolLogStatus.VERIFIED as SSLogStatus },
      { status: SundaySchoolLogStatus.VERIFIED as SSLogStatus },
      { status: SundaySchoolLogStatus.VERIFIED as SSLogStatus },
      { status: SundaySchoolLogStatus.VERIFIED as SSLogStatus },
    ]

    const result = calculateSSAttendance(logs, 6)
    expect(result).not.toBeNull()
    expect(result!.present).toBe(6)
    expect(result!.percentage).toBe(100)
    expect(result!.met).toBe(true)
  })

  it('should count MANUAL as present', () => {
    const logs = [
      { status: SundaySchoolLogStatus.VERIFIED as SSLogStatus },
      { status: SundaySchoolLogStatus.MANUAL as SSLogStatus },
      { status: SundaySchoolLogStatus.VERIFIED as SSLogStatus },
    ]

    const result = calculateSSAttendance(logs, 6)
    expect(result!.present).toBe(3)
  })

  it('should exclude EXCUSED from calculation', () => {
    const logs = [
      { status: SundaySchoolLogStatus.VERIFIED as SSLogStatus },
      { status: SundaySchoolLogStatus.VERIFIED as SSLogStatus },
      { status: SundaySchoolLogStatus.VERIFIED as SSLogStatus },
      { status: SundaySchoolLogStatus.EXCUSED as SSLogStatus },
    ]

    const result = calculateSSAttendance(logs, 6)
    // effectiveTotal = 6 - 1 = 5
    // percentage = 3/5 * 100 = 60%
    expect(result!.excused).toBe(1)
    expect(result!.effectiveTotal).toBe(5)
    expect(result!.percentage).toBe(60)
    expect(result!.met).toBe(false)
  })

  it('should meet 75% threshold exactly', () => {
    const logs = [
      { status: SundaySchoolLogStatus.VERIFIED as SSLogStatus },
      { status: SundaySchoolLogStatus.VERIFIED as SSLogStatus },
      { status: SundaySchoolLogStatus.VERIFIED as SSLogStatus },
      { status: SundaySchoolLogStatus.EXCUSED as SSLogStatus },
    ]

    // totalWeeks=4, excused=1, effectiveTotal=3, present=3
    // 3/3 = 100%, met
    const result = calculateSSAttendance(logs, 4)
    expect(result!.met).toBe(true)
  })

  it('should return null when all weeks are excused', () => {
    const logs = [
      { status: SundaySchoolLogStatus.EXCUSED as SSLogStatus },
      { status: SundaySchoolLogStatus.EXCUSED as SSLogStatus },
    ]

    const result = calculateSSAttendance(logs, 2)
    expect(result).toBeNull()
  })

  it('should count REJECTED as absent', () => {
    const logs = [
      { status: SundaySchoolLogStatus.VERIFIED as SSLogStatus },
      { status: SundaySchoolLogStatus.REJECTED as SSLogStatus },
      { status: SundaySchoolLogStatus.REJECTED as SSLogStatus },
    ]

    const result = calculateSSAttendance(logs, 6)
    // present=1, excused=0, absent=6-1-0=5
    expect(result!.present).toBe(1)
    expect(result!.absent).toBe(5)
  })

  it('should handle the 75% threshold with 6 weeks', () => {
    // 4 present, 0 excused, 2 absent = 4/6 = 66.7% -> not met
    const logs4of6 = [
      { status: SundaySchoolLogStatus.VERIFIED as SSLogStatus },
      { status: SundaySchoolLogStatus.VERIFIED as SSLogStatus },
      { status: SundaySchoolLogStatus.VERIFIED as SSLogStatus },
      { status: SundaySchoolLogStatus.VERIFIED as SSLogStatus },
    ]
    const result = calculateSSAttendance(logs4of6, 6)
    expect(result!.percentage).toBeCloseTo(66.67, 1)
    expect(result!.met).toBe(false)

    // 5 present = 5/6 = 83.3% -> met
    const logs5of6 = [
      ...logs4of6,
      { status: SundaySchoolLogStatus.VERIFIED as SSLogStatus },
    ]
    const result2 = calculateSSAttendance(logs5of6, 6)
    expect(result2!.percentage).toBeCloseTo(83.33, 1)
    expect(result2!.met).toBe(true)
  })
})

describe('getAssignmentWeeks', () => {
  it('should generate correct number of weeks', () => {
    const startDate = new Date(2025, 9, 5) // Oct 5 (Sunday)
    const weeks = getAssignmentWeeks(startDate, 6)
    expect(weeks).toHaveLength(6)
  })

  it('should generate weeks 7 days apart', () => {
    // Use January dates to avoid DST boundary issues
    const startDate = new Date(2025, 0, 5)
    const weeks = getAssignmentWeeks(startDate, 6)

    for (let i = 1; i < weeks.length; i++) {
      const daysDiff = Math.round(
        (weeks[i].weekOf.getTime() - weeks[i - 1].weekOf.getTime()) / (24 * 60 * 60 * 1000)
      )
      expect(daysDiff).toBe(7)
    }
  })

  it('should number weeks starting from 1', () => {
    const startDate = new Date(2025, 9, 5)
    const weeks = getAssignmentWeeks(startDate, 3)
    expect(weeks[0].weekNumber).toBe(1)
    expect(weeks[1].weekNumber).toBe(2)
    expect(weeks[2].weekNumber).toBe(3)
  })
})

describe('getWeekNumber', () => {
  it('should return correct week number', () => {
    const startDate = new Date(2025, 9, 5) // Oct 5
    const weekOf = new Date(2025, 9, 19) // Oct 19 (2 weeks later)
    expect(getWeekNumber(startDate, weekOf)).toBe(3) // Week 3
  })

  it('should return 1 for the start date itself', () => {
    const startDate = new Date(2025, 9, 5)
    expect(getWeekNumber(startDate, startDate)).toBe(1)
  })

  it('should return null for dates before start', () => {
    const startDate = new Date(2025, 9, 5)
    const before = new Date(2025, 8, 28) // Sep 28
    expect(getWeekNumber(startDate, before)).toBeNull()
  })
})

describe('GRADE_DISPLAY_NAMES', () => {
  it('should have display names for all 8 grades', () => {
    expect(Object.keys(GRADE_DISPLAY_NAMES)).toHaveLength(8)
    expect(GRADE_DISPLAY_NAMES.PRE_K).toBe('Pre-K')
    expect(GRADE_DISPLAY_NAMES.KINDERGARTEN).toBe('Kindergarten')
    expect(GRADE_DISPLAY_NAMES.GRADE_1).toBe('1st Grade')
    expect(GRADE_DISPLAY_NAMES.GRADE_6_PLUS).toBe('6th Grade+')
  })
})

describe('async rotations', () => {
  const start = new Date('2026-10-04T00:00:00Z')
  const verified = (weekNumber: number) => ({ weekNumber, status: SundaySchoolLogStatus.VERIFIED })

  it('counts only weeks that have started', () => {
    expect(elapsedRotationWeeks(start, 6, new Date('2026-10-03T12:00:00Z'))).toBe(0)
    expect(elapsedRotationWeeks(start, 6, new Date('2026-10-04T12:00:00Z'))).toBe(1)
    expect(elapsedRotationWeeks(start, 6, new Date('2026-10-12T00:00:00Z'))).toBe(2)
    expect(elapsedRotationWeeks(start, 6, new Date('2027-03-01T00:00:00Z'))).toBe(6)
  })

  it("doesn't fail a rotation for weeks still ahead", () => {
    const weekOne = new Date('2026-10-05T00:00:00Z')
    expect(rotationAttendanceToDate({ startDate: start, totalWeeks: 6, logs: [verified(1)] }, weekOne)?.percentage).toBe(100)
    expect(rotationAttendanceToDate({ startDate: start, totalWeeks: 6, logs: [] }, new Date('2026-10-01T00:00:00Z'))).toBeNull()
    // Six weeks in with one attended: 1/6
    expect(rotationAttendanceToDate({ startDate: start, totalWeeks: 6, logs: [verified(1)] }, new Date('2027-01-01T00:00:00Z'))?.met).toBe(false)
  })

  it('requires an active rotation for the current year level', () => {
    expect(rotationRequirementMet([], 'YEAR_2')).toEqual({ needsRotation: true, met: false })
    expect(rotationRequirementMet([{ yearLevel: 'YEAR_2', isActive: false, attendance: { met: true } }], 'YEAR_2'))
      .toEqual({ needsRotation: true, met: false })
    expect(rotationRequirementMet([{ yearLevel: 'YEAR_2', isActive: true, attendance: null }], 'YEAR_2'))
      .toEqual({ needsRotation: false, met: true })
    expect(rotationRequirementMet([
      { yearLevel: 'YEAR_2', isActive: true, attendance: { met: true } },
      { yearLevel: 'YEAR_1', isActive: true, attendance: { met: false } },
    ], 'YEAR_2')).toEqual({ needsRotation: false, met: false })
  })
})
