import { SundaySchoolLevel } from '@prisma/client'

export const ROTATION_WEEKS = 4
export const ROTATION_LEVELS = [
  SundaySchoolLevel.PRE_K, SundaySchoolLevel.KINDERGARTEN,
  SundaySchoolLevel.GRADE_1, SundaySchoolLevel.GRADE_2, SundaySchoolLevel.GRADE_3,
  SundaySchoolLevel.GRADE_4, SundaySchoolLevel.GRADE_5, SundaySchoolLevel.GRADE_6,
  SundaySchoolLevel.GRADE_7, SundaySchoolLevel.GRADE_8,
] as const

export function nextRotationLevel(level: SundaySchoolLevel): SundaySchoolLevel {
  const index = ROTATION_LEVELS.findIndex(candidate => candidate === level)
  if (index < 0) throw new RotationWorkflowError('Rotations must use Pre-K through eighth grade', 400)
  return ROTATION_LEVELS[(index + 1) % ROTATION_LEVELS.length]
}

export function completedRotationLevels(rotations: Array<{ class?: { level: SundaySchoolLevel } | null; rotationForm?: { status: string; level?: SundaySchoolLevel } | null }>): Set<SundaySchoolLevel> {
  return new Set(rotations.flatMap(rotation => {
    const level = rotation.rotationForm?.level ?? rotation.class?.level
    return rotation.rotationForm?.status === 'APPROVED' && level && ROTATION_LEVELS.some(candidate => candidate === level) ? [level] : []
  }))
}
export const ROTATION_FORM_MAX_BYTES = 4.5 * 1024 * 1024
export const ROTATION_FORM_FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']

export class RotationWorkflowError extends Error {
  constructor(message: string, readonly status = 409) { super(message) }
}

export function rotationWeekDate(startDate: Date | string, weekNumber: number): Date {
  const date = new Date(startDate)
  date.setUTCDate(date.getUTCDate() + (weekNumber - 1) * 7)
  date.setUTCHours(0, 0, 0, 0)
  return date
}

export function rotationCanSubmit(startDate: Date | string, now = new Date()): boolean {
  return now >= rotationWeekDate(startDate, ROTATION_WEEKS)
}

export function allRotationWeeksVerified(logs: Array<{ weekNumber: number; status: string }>): boolean {
  const verified = new Set(logs.filter(log => log.status === 'VERIFIED' || log.status === 'MANUAL').map(log => log.weekNumber))
  return Array.from({ length: ROTATION_WEEKS }, (_, index) => index + 1).every(week => verified.has(week))
}

export function nextRotationStart(startDate: Date | string, now = new Date()): Date {
  const currentSunday = new Date(now)
  currentSunday.setUTCHours(0, 0, 0, 0)
  currentSunday.setUTCDate(currentSunday.getUTCDate() - currentSunday.getUTCDay())
  const earliest = rotationWeekDate(startDate, ROTATION_WEEKS + 1)
  return currentSunday > earliest ? currentSunday : earliest
}
