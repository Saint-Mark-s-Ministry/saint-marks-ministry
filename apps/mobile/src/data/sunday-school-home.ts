/**
 * Pure logic for the Sunday School home screen's KPI grid and "This week's
 * lesson" card (SMM-48 remainder).
 */

import type { SundaySchoolWeeklyLesson } from "@stmark/contracts";

/**
 * The single lesson with the soonest `sundayDate`, ties broken by class name.
 * Null when there are none. The feed this reads from
 * (`/api/sunday-school/lessons`, no `scope=year`) is already windowed to
 * today-or-later server-side, so the soonest date is always the nearest
 * upcoming one — this does not need to compare against "now" itself.
 */
export function nearestLesson(lessons: SundaySchoolWeeklyLesson[]): SundaySchoolWeeklyLesson | null {
  if (!lessons.length) return null;
  return [...lessons].sort((a, b) =>
    new Date(a.sundayDate).getTime() - new Date(b.sundayDate).getTime() ||
    a.class.name.localeCompare(b.class.name)
  )[0];
}

/** Where the "Classes" KPI tile routes: age-group management for admins/coordinators, otherwise the Classes tab. */
export function ageGroupDestination(standing: {
  isAdmin: boolean;
  coordinatesAnyAgeGroup: boolean;
}): "/age-groups" | "/(tabs)/classes" {
  return standing.isAdmin || standing.coordinatesAnyAgeGroup ? "/age-groups" : "/(tabs)/classes";
}
