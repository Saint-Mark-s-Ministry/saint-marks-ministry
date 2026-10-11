import { SundaySchoolGrade, SundaySchoolLevel, SundaySchoolLogStatus } from '@prisma/client'
import { randomBytes } from 'crypto'

// ============================================
// Code Generation
// ============================================

const GRADE_PREFIXES: Record<SundaySchoolGrade, string> = {
  PRE_K: 'PK',
  KINDERGARTEN: 'KG',
  GRADE_1: 'G1',
  GRADE_2: 'G2',
  GRADE_3: 'G3',
  GRADE_4: 'G4',
  GRADE_5: 'G5',
  GRADE_6_PLUS: 'G6',
}

export const GRADE_DISPLAY_NAMES: Record<SundaySchoolGrade, string> = {
  PRE_K: 'Pre-K',
  KINDERGARTEN: 'Kindergarten',
  GRADE_1: '1st Grade',
  GRADE_2: '2nd Grade',
  GRADE_3: '3rd Grade',
  GRADE_4: '4th Grade',
  GRADE_5: '5th Grade',
  GRADE_6_PLUS: '6th Grade+',
}

// Exclude confusable chars (0/O, 1/I/L)
const ALPHANUMERIC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateCode(grade: SundaySchoolGrade): string {
  const prefix = GRADE_PREFIXES[grade]
  const bytes = randomBytes(4)
  let random = ''
  for (let i = 0; i < 4; i++) {
    random += ALPHANUMERIC[bytes[i] % ALPHANUMERIC.length]
  }
  return `${prefix}-${random}`
}

export function parseCodePrefix(code: string): SundaySchoolGrade | null {
  const prefix = code.split('-')[0]
  for (const [grade, p] of Object.entries(GRADE_PREFIXES)) {
    if (p === prefix) return grade as SundaySchoolGrade
  }
  return null
}

export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day) // Go to Sunday
  d.setHours(0, 0, 0, 0)
  return d
}

export function getCodeValidUntil(weekOf: Date): Date {
  const d = new Date(weekOf)
  d.setDate(d.getDate() + 7)
  d.setHours(23, 59, 59, 999)
  return d
}

// ============================================
// Attendance Calculation
// ============================================

interface SSLog {
  status: SundaySchoolLogStatus
}

export function calculateSSAttendance(logs: SSLog[], totalWeeks: number) {
  const present = logs.filter(
    l => l.status === SundaySchoolLogStatus.VERIFIED || l.status === SundaySchoolLogStatus.MANUAL
  ).length
  const excused = logs.filter(
    l => l.status === SundaySchoolLogStatus.EXCUSED
  ).length
  const effectiveTotal = totalWeeks - excused

  if (effectiveTotal <= 0) return null // All weeks excused

  const percentage = (present / effectiveTotal) * 100
  return {
    present,
    excused,
    absent: totalWeeks - present - excused,
    effectiveTotal,
    percentage,
    met: percentage >= 75,
  }
}

// ============================================
// Week Helpers
// ============================================

export function getAssignmentWeeks(startDate: Date, totalWeeks: number) {
  const weeks = []
  for (let i = 0; i < totalWeeks; i++) {
    const weekOf = new Date(startDate)
    weekOf.setDate(weekOf.getDate() + i * 7)
    weeks.push({ weekNumber: i + 1, weekOf })
  }
  return weeks
}

export function getWeekNumber(startDate: Date, weekOf: Date): number | null {
  const diffMs = weekOf.getTime() - startDate.getTime()
  const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000))
  const weekNumber = diffWeeks + 1
  return weekNumber >= 1 ? weekNumber : null
}

/** Rotation weeks that have started by `now`; later weeks can't be missed yet. */
export function elapsedRotationWeeks(startDate: Date | string, totalWeeks: number, now = new Date()): number {
  const started = Math.floor((now.getTime() - new Date(startDate).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
  return Math.max(0, Math.min(totalWeeks, started))
}

/**
 * Rotation attendance so far: only weeks that have started count, so a
 * rotation in progress isn't failed for weeks still ahead. Null before it
 * starts or when every elapsed week is excused.
 */
export function rotationAttendanceToDate(
  assignment: { startDate: Date | string; totalWeeks: number; logs: Array<SSLog & { weekNumber: number }> },
  now = new Date()
) {
  const weeks = elapsedRotationWeeks(assignment.startDate, assignment.totalWeeks, now)
  if (weeks === 0) return null
  return calculateSSAttendance(assignment.logs.filter((log) => log.weekNumber <= weeks), weeks)
}

/**
 * An async student needs a rotation for the year level they're in now; a
 * missing one is not met. Other years count only if a rotation exists.
 */
export function rotationRequirementMet(
  rotations: Array<{ yearLevel: string; isActive: boolean; attendance: { met: boolean } | null }>,
  currentYearLevel: string
) {
  const active = rotations.filter((rotation) => rotation.isActive)
  const current = active.find((rotation) => rotation.yearLevel === currentYearLevel)
  const metFor = (rotation: (typeof active)[number] | undefined) => (rotation?.attendance ? rotation.attendance.met : true)
  const others = active.filter((rotation) => rotation.yearLevel !== currentYearLevel)
  return {
    needsRotation: !current,
    met: Boolean(current) && metFor(current) && others.every((rotation) => metFor(rotation)),
  }
}

const LEVEL_TO_ROTATION_GRADE: Partial<Record<SundaySchoolLevel, SundaySchoolGrade>> = {
  PRE_K: 'PRE_K',
  KINDERGARTEN: 'KINDERGARTEN',
  GRADE_1: 'GRADE_1',
  GRADE_2: 'GRADE_2',
  GRADE_3: 'GRADE_3',
  GRADE_4: 'GRADE_4',
  GRADE_5: 'GRADE_5',
}

/**
 * The rotation grade for a Sunday School class. Rotation grades only prefix
 * the weekly verification codes, so Grade 6 and up, College/Grad and Special
 * Needs classes share the 6th+ codes.
 */
export function rotationGradeForClassLevel(level: SundaySchoolLevel): SundaySchoolGrade {
  return LEVEL_TO_ROTATION_GRADE[level] ?? 'GRADE_6_PLUS'
}
