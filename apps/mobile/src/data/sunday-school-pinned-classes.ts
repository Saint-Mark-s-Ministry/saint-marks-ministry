/**
 * SUPER_ADMIN-only view preference: which Sunday School classes this account
 * defaults to seeing on the Classes screen, instead of every class in the
 * ministry. Pure UI convenience — never consulted for authorization, and a
 * pinned id that no longer exists (a prior academic year's class, say) is
 * simply dropped rather than treated as an error.
 */

import type { SundaySchoolClassSummary } from "@stmark/contracts";

export function filterClassesByPins(
  classes: SundaySchoolClassSummary[],
  pinnedClassIds: string[],
): SundaySchoolClassSummary[] {
  if (!pinnedClassIds.length) return classes;
  const pinned = new Set(pinnedClassIds);
  return classes.filter((cls) => pinned.has(cls.id));
}

/** Toggling a class id in or out of a pinned set, for a checklist UI. */
export function togglePin(pinnedClassIds: string[], classId: string): string[] {
  return pinnedClassIds.includes(classId)
    ? pinnedClassIds.filter((id) => id !== classId)
    : [...pinnedClassIds, classId];
}
