/**
 * Pure logic for the Sunday School Classes list, Class detail, and Age
 * groups screens (SMM-53).
 */

import type { SundaySchoolAgeGroup, SundaySchoolClassSummary, SundaySchoolLevel } from "@stmark/contracts";
import { LEVEL_ORDER, getLevelDisplayName } from "@stmark/domain";

const LEVEL_ORDER_INDEX = new Map(LEVEL_ORDER.map((level, index) => [level, index]));

/** "1st Grade" -> "1", for a compact range like "Grades 1–3". Non-numeric grades (Pre-K, Kindergarten, Special Needs, College & Grad) keep their own short word instead. */
function shortGradeLabel(level: SundaySchoolLevel): string {
  if (level === "KINDERGARTEN") return "K";
  const match = /^(\d+)(st|nd|rd|th) Grade$/.exec(getLevelDisplayName(level));
  return match ? match[1] : getLevelDisplayName(level);
}

/**
 * A compact label for an age group's grade span, matching the artboard's own
 * "Pre-K – K" / "Grades 1–3" phrasing. Levels are sorted by this app's own
 * grade ordering (not alphabetically or as stored), since that's the only
 * ordering a "range" is meaningful in.
 */
export function levelRangeLabel(levels: SundaySchoolLevel[]): string {
  const sorted = [...levels].sort(
    (a, b) => (LEVEL_ORDER_INDEX.get(a) ?? 0) - (LEVEL_ORDER_INDEX.get(b) ?? 0),
  );
  if (!sorted.length) return "No grades";
  if (sorted.length === 1) return getLevelDisplayName(sorted[0]);

  const indices = sorted.map((l) => LEVEL_ORDER_INDEX.get(l) ?? -1);
  const contiguous = indices.every((index, i) => i === 0 || index === indices[i - 1] + 1);
  // A numeric "Grades N–M" reads oddly if either end is a non-numeric level
  // (Pre-K, Special Needs, College & Grad) — those fall back to full names.
  const allNumeric = sorted.every((l) => /^GRADE_\d+$/.test(l));
  if (contiguous && allNumeric) {
    return `Grades ${shortGradeLabel(sorted[0])}–${shortGradeLabel(sorted[sorted.length - 1])}`;
  }
  if (contiguous) {
    return `${shortGradeLabel(sorted[0])} – ${shortGradeLabel(sorted[sorted.length - 1])}`;
  }
  return sorted.map(getLevelDisplayName).join(", ");
}

export type ClassGroup = { key: string; name: string; sortOrder: number; classes: SundaySchoolClassSummary[] };

/**
 * Groups classes by their age group, in the age-group list's own order (the
 * dashboard's own `ageGroups` array arrives pre-sorted by sortOrder, but
 * without the field itself — this uses the array's own position instead),
 * with ungrouped classes collected last under "Other classes" — never dropped.
 */
export function groupClassesByAgeGroup(
  classes: SundaySchoolClassSummary[],
  ageGroups: Pick<SundaySchoolAgeGroup, "id" | "name">[],
): ClassGroup[] {
  const order = new Map(ageGroups.map((g, i) => [g.id, i]));
  const groups = new Map<string, ClassGroup>();
  for (const cls of classes) {
    const key = cls.ageGroup?.id ?? "__other__";
    const name = cls.ageGroup?.name ?? "Other classes";
    const group = groups.get(key) ?? { key, name, sortOrder: order.get(key) ?? Number.MAX_SAFE_INTEGER, classes: [] };
    group.classes.push(cls);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** The small color token for an attendance-percentage figure, same thresholds used on Child detail. */
export function attendanceTone(percentage: number): "success" | "warning" | "danger" {
  if (percentage >= 75) return "success";
  if (percentage >= 50) return "warning";
  return "danger";
}

/** "Sep 27", reading the stored UTC calendar date directly — no local time-zone shift. */
export function shortMonthDay(dateIso: string): string {
  return new Date(`${dateIso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** The recent-sessions row's second line: how many of the current roster were marked present that day. */
export function sessionAttendanceSubtitle(
  session: { attendance: Array<{ status: string }>; topic?: string | null },
  rosterSize: number,
): string {
  const present = session.attendance.filter((a) => a.status === "PRESENT").length;
  const base = `${present} of ${rosterSize} present`;
  return session.topic ? `${base} · ${session.topic}` : base;
}

export type LevelMoveImpact = { movesBand: boolean; destinationBandName: string | null };

/**
 * Whether changing a class's level would re-home it under a different age
 * group's band — and so, per the server's own rule, hand it to a different
 * coordinator. Used to warn before saving, not to gate the save itself (the
 * server re-checks band authority on its own).
 */
export function levelMoveImpact(
  currentLevel: SundaySchoolLevel,
  nextLevel: SundaySchoolLevel,
  ageGroups: Pick<SundaySchoolAgeGroup, "id" | "name" | "levels">[],
): LevelMoveImpact {
  if (currentLevel === nextLevel) return { movesBand: false, destinationBandName: null };
  const currentBand = ageGroups.find((g) => g.levels.includes(currentLevel));
  const nextBand = ageGroups.find((g) => g.levels.includes(nextLevel));
  if ((currentBand?.id ?? null) === (nextBand?.id ?? null)) return { movesBand: false, destinationBandName: null };
  return { movesBand: true, destinationBandName: nextBand?.name ?? null };
}
