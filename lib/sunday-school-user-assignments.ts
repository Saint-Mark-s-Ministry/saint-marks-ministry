import type { SundaySchoolAuthority, SundaySchoolLevel } from '@prisma/client'
import { getLevelDisplayName, LEVEL_ORDER } from './sunday-school-class'

export interface SundaySchoolAssignmentSummary {
  id: string
  authority: SundaySchoolAuthority
  classId: string | null
  ageGroupId: string | null
  class: { id: string; name: string; level: SundaySchoolLevel } | null
  ageGroup: { id: string; name: string; levels: SundaySchoolLevel[] } | null
}

const LEVEL_INDEX = new Map(LEVEL_ORDER.map((level, index) => [level, index]))

/**
 * Flatten direct class assignments and age-group coordinator assignments into
 * the grade levels a person currently serves, without duplicate labels.
 */
export function getSundaySchoolAssignmentLevels(
  assignments: SundaySchoolAssignmentSummary[] | undefined
): SundaySchoolLevel[] {
  const levels = new Set<SundaySchoolLevel>()

  for (const assignment of assignments ?? []) {
    if (assignment.class) levels.add(assignment.class.level)
    for (const level of assignment.ageGroup?.levels ?? []) levels.add(level)
  }

  return Array.from(levels).sort(
    (left, right) =>
      (LEVEL_INDEX.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (LEVEL_INDEX.get(right) ?? Number.MAX_SAFE_INTEGER)
  )
}

export interface SundaySchoolResponsibility {
  key: string
  label: string
  scope: string
}

/** Keep class and age-group scopes separate, even when they cover the same grade. */
export function getSundaySchoolResponsibilities(
  assignments: SundaySchoolAssignmentSummary[] | undefined
): SundaySchoolResponsibility[] {
  const responsibilities = new Map<string, SundaySchoolResponsibility>()
  const levels = getSundaySchoolAssignmentLevels(assignments)

  for (const level of levels) {
    for (const authority of ['COORDINATOR', 'SERVANT'] as const) {
      for (const assignment of assignments ?? []) {
        if (assignment.authority !== authority) continue
        const scope = assignment.class?.level === level
          ? { key: `class:${assignment.class.id}`, name: assignment.class.name }
          : assignment.ageGroup?.levels.includes(level)
            ? { key: `age-group:${assignment.ageGroup.id}`, name: assignment.ageGroup.name }
            : null
        if (!scope) continue
        const key = `${scope.key}:${level}:${authority}`
        responsibilities.set(key, {
          key,
          label: `${getLevelDisplayName(level)} ${authority === 'COORDINATOR' ? 'Coordinator' : 'Servant'}`,
          scope: scope.name,
        })
      }
    }
  }

  return [...responsibilities.values()]
}

/** Grade and authority labels for places that do not need the class scope. */
export function getSundaySchoolResponsibilityLabels(
  assignments: SundaySchoolAssignmentSummary[] | undefined
): string[] {
  return [...new Set(getSundaySchoolResponsibilities(assignments).map(responsibility => responsibility.label))]
}
