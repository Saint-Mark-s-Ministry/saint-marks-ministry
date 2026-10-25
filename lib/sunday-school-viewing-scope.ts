import type { SundaySchoolLevel } from '@prisma/client'

export const ageGroupViewingValue = (id: string) => `age-group:${id}`

export interface ViewingAgeGroup {
  id: string
  name: string
  levels: SundaySchoolLevel[]
  isActive?: boolean
  overseerId?: string | null
}

/** Display defaults only; this never grants or restricts server permissions. */
export function defaultPriestViewing(user: { id: string; role: string } | undefined, groups: ViewingAgeGroup[]): string | null {
  if (user?.role !== 'PRIEST') return null
  const assigned = groups.filter(group => group.isActive !== false && group.overseerId === user.id)
  // Multiple overseen bands are represented together by the personal scope.
  return assigned.length === 1 ? ageGroupViewingValue(assigned[0].id) : assigned.length > 1 ? 'my-age-groups' : null
}

export function viewingAgeGroups(value: string | null, groups: ViewingAgeGroup[], userId?: string): ViewingAgeGroup[] | null {
  if (value === 'my-age-groups') return groups.filter(group => group.isActive !== false && group.overseerId === userId)
  if (!value?.startsWith('age-group:')) return null
  const group = groups.find(group => group.isActive !== false && ageGroupViewingValue(group.id) === value)
  return group ? [group] : null
}
