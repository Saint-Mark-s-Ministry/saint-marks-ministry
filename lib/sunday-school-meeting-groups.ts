import type { SundaySchoolDashboard } from '@/types/sunday-school'

/** Use the dashboard's server-scoped classes; every meeting request also authorizes on the server. */
export function servantsMeetingGroups(dashboard?: SundaySchoolDashboard) {
  return (dashboard?.ageGroups ?? []).filter(group =>
    (
      dashboard?.standing.isAdmin || dashboard?.standing.readOnly || group.canCoordinate ||
      dashboard?.classes.some(cls => cls.ageGroup?.id === group.id)
    )
  )
}
