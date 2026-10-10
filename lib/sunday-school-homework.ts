import type { SundaySchoolHomeworkCompletionStatus, SundaySchoolLevel } from '@prisma/client'
import { prisma } from './prisma'
import { normalizeSessionDate } from './sunday-school-class'
import { validateWeeklyLessonResources } from './sunday-school-lessons'

export const HOMEWORK_COMPLETION_STATUSES = ['COMPLETED', 'NOT_COMPLETED'] as const

export function getHomeworkDueDate(assignedDate: Date | string): Date {
  const dueDate = normalizeSessionDate(assignedDate)
  dueDate.setUTCDate(dueDate.getUTCDate() + 7)
  return dueDate
}

export const validateHomeworkResources = validateWeeklyLessonResources

export function isHomeworkCompletionStatus(value: unknown): value is SundaySchoolHomeworkCompletionStatus {
  return typeof value === 'string' && HOMEWORK_COMPLETION_STATUSES.includes(
    value as SundaySchoolHomeworkCompletionStatus
  )
}

export function summarizeHomeworkStatuses(
  statuses: Array<SundaySchoolHomeworkCompletionStatus | null | undefined>,
) {
  const completed = statuses.filter(status => status === 'COMPLETED').length
  const notCompleted = statuses.filter(status => status === 'NOT_COMPLETED').length
  const notRecorded = statuses.length - completed - notCompleted
  const recorded = completed + notCompleted

  return {
    completed,
    notCompleted,
    notRecorded,
    completionRate: recorded > 0 ? Math.round((completed / recorded) * 100) : null,
  }
}

export async function getElementaryClass(classId: string) {
  const cls = await prisma.sundaySchoolClass.findUnique({
    where: { id: classId },
    select: {
      id: true,
      name: true,
      level: true,
      academicYearId: true,
      sundaySchoolYearId: true,
      isActive: true,
    },
  })
  if (!cls) return null

  const elementaryBands = await prisma.sundaySchoolAgeGroup.findMany({
    where: {
      isElementary: true,
      isActive: true,
      OR: [
        { sundaySchoolYearId: cls.sundaySchoolYearId },
        ...(cls.sundaySchoolYearId ? [{ sundaySchoolYearId: null }] : []),
      ],
    },
    select: { sundaySchoolYearId: true, levels: true },
  })

  return classBelongsToElementaryBand(cls, elementaryBands) ? cls : null
}

export function classBelongsToElementaryBand(
  cls: { level: SundaySchoolLevel; sundaySchoolYearId: string | null },
  bands: Array<{ sundaySchoolYearId: string | null; levels: SundaySchoolLevel[] }>,
) {
  const exactBands = bands.filter(band => band.sundaySchoolYearId === cls.sundaySchoolYearId)
  const candidates = exactBands.length > 0 ? exactBands : bands.filter(band => band.sundaySchoolYearId === null)
  return candidates.some(band => band.levels.includes(cls.level))
}
