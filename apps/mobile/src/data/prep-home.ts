/**
 * Pure logic for the Servants Prep Home dashboard (SMM-32), pulled out of
 * the screen component so it's unit-testable without rendering native UI.
 */

export const PREP_ADMIN_ROLES = ["SUPER_ADMIN", "PRIEST", "SERVANT_PREP"];

/**
 * Only admin-like roles see the operational dashboard (stats, at-risk
 * students, attendance progress). Every other role must never see it —
 * this is the highest-risk path: a STUDENT or MENTOR account seeing
 * another student's name/attendance/exam percentage would be a real data
 * leak, not just a cosmetic miss.
 */
export function isAdminLike(role?: string | null): boolean {
  return !!role && PREP_ADMIN_ROLES.includes(role);
}

export function attendanceProgress(marked: number, roster: number) {
  const inProgress = marked > 0 && roster > 0;
  const percent = roster > 0 ? Math.min(100, Math.round((marked / roster) * 1000) / 10) : 0;
  return { inProgress, percent };
}

export type Tone = "success" | "warning" | "danger" | "neutral";

/** The program-wide exam average: on target (>=75%) reads as success, else danger. */
export function examAverageTone(average: number | null): Tone {
  if ((average === null || average === undefined)) return "neutral";
  return average >= 75 ? "success" : "danger";
}

/** A single at-risk student's attendance or exam figure, graduated by severity. */
export function atRiskTone(value: number | null, kind: "attendance" | "exam"): Tone {
  if ((value === null || value === undefined)) return "neutral";
  if (kind === "attendance") return value < 75 ? "danger" : "success";
  if (value < 60) return "danger";
  if (value < 75) return "warning";
  return "success";
}

export type LessonForSchedule = { status: string; scheduledDate: string };

/** The index of the next non-completed lesson at or after `today` (YYYY-MM-DD), or -1. */
export function nextLessonIndex(lessons: LessonForSchedule[], today: string): number {
  return lessons.findIndex((lesson) => lesson.status !== "COMPLETED" && lesson.scheduledDate.slice(0, 10) >= today);
}
