/**
 * Pure logic for the student "Serving code" screen (SMM-46): the week math,
 * the serving-stint progress, code validation, why a submit is blocked, and
 * the wording for each server error.
 *
 * Mirrors the server rules in app/api/sunday-school/logs/route.ts and
 * lib/sunday-school-utils.ts. The week start uses the device's local Sunday
 * midnight, exactly as the web student page does, because the server matches
 * the submitted weekOf to the code's week by exact timestamp.
 *
 * Never returns or logs the code value. The screen must not log it either.
 */

export type LogStatus = "VERIFIED" | "MANUAL" | "EXCUSED" | "REJECTED";

export type Assignment = {
  id: string;
  grade: string;
  yearLevel: "YEAR_1" | "YEAR_2";
  totalWeeks: number;
  startDate: string;
  isActive: boolean;
  academicYear: { name: string } | null;
};

export type ServingLog = {
  id: string;
  assignmentId: string;
  weekNumber: number;
  weekOf: string;
  status: LogStatus;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Local Sunday midnight of `now`'s week, as the web student page sends it. */
export function currentWeekOf(now: Date): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Mirrors getWeekNumber on the server: week 1 is the week the stint starts. Null before the start. */
export function weekNumberFor(startDate: string, weekOf: Date): number | null {
  const diffWeeks = Math.round((weekOf.getTime() - Date.parse(startDate)) / WEEK_MS);
  const n = diffWeeks + 1;
  return n >= 1 ? n : null;
}

export type StintState = "done" | "rejected" | "current" | "missed" | "upcoming";
export type StintSegment = { weekNumber: number; state: StintState };

/** One segment per week of the stint, so progress reads as text and shape, not color alone. */
export function stintSegments(assignment: Assignment, logs: ServingLog[], now: Date): StintSegment[] {
  const current = weekNumberFor(assignment.startDate, currentWeekOf(now)) ?? 0;
  return Array.from({ length: assignment.totalWeeks }, (_, i) => {
    const weekNumber = i + 1;
    const log = logs.find((l) => l.weekNumber === weekNumber);
    let state: StintState;
    if (log && log.status === "REJECTED") state = "rejected";
    else if (log) state = "done";
    else if (weekNumber === current) state = "current";
    else if (weekNumber < current) state = "missed";
    else state = "upcoming";
    return { weekNumber, state };
  });
}

export function weeksDone(segments: StintSegment[]): number {
  return segments.filter((s) => s.state === "done").length;
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

const CODE_PATTERN = /^[A-Z0-9-]+$/;

/** Checks before any network call. Returns a message to show, or null when it's fine to send. */
export function validateCode(raw: string): string | null {
  const code = normalizeCode(raw);
  if (!code) return "Enter the code your servant gave you.";
  if (code.length < 4) return "That code is too short. Check it with your servant.";
  if (!CODE_PATTERN.test(code)) return "Codes use letters, numbers and dashes only.";
  return null;
}

export type SubmitBlocker =
  | { kind: "ready" }
  | { kind: "not-eligible"; message: string }
  | { kind: "outside-period"; message: string }
  | { kind: "already-logged"; message: string };

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Whether this week can be logged at all. Shown before the code field so the student knows the next step. */
export function submitBlocker(assignment: Assignment | null, logs: ServingLog[], now: Date): SubmitBlocker {
  if (!assignment) {
    return {
      kind: "not-eligible",
      message: "You don't have an active Sunday School serving stint, so there's nothing to log. Ask your servant if you think this is wrong.",
    };
  }
  const week = weekNumberFor(assignment.startDate, currentWeekOf(now));
  if (week === null) {
    return {
      kind: "outside-period",
      message: `Your serving stint starts ${shortDate(assignment.startDate)}. You can log this week once it begins.`,
    };
  }
  if (week > assignment.totalWeeks) {
    return { kind: "outside-period", message: "Your serving stint has finished. Ask your servant about any weeks still open." };
  }
  const logged = logs.find((l) => l.weekNumber === week && l.status !== "REJECTED");
  if (logged) return { kind: "already-logged", message: "This week is already logged. You don't need to submit again." };
  return { kind: "ready" };
}

/**
 * What to tell the student when the server refuses a code. Each one says the
 * next step. The server's own wording is never shown, so nothing about the
 * code reaches the screen.
 */
export function submitErrorMessage(status: number | null, serverMessage?: string): string {
  if (status === null) return "Couldn't reach the server. Your code is still here. Submit again once you're connected.";
  if (status === 404 && /assignment/i.test(serverMessage ?? "")) return "You don't have an active serving stint, so there's nothing to log.";
  if (status === 404) return "That code doesn't match. Check it with your servant and try again.";
  if (status === 410) return "This code has expired or been turned off. Ask your servant for this week's code.";
  if (status === 422 && /grade/i.test(serverMessage ?? "")) return "This code is for a different grade. Ask your servant for your grade's code.";
  if (status === 422) return "This code is for a different week. Ask your servant for this week's code.";
  if (status === 409) return "This week is already logged. You don't need to submit again.";
  if (status === 400) return "Your serving stint doesn't cover this week.";
  if (status === 403) return "Only students with an active serving stint can submit codes.";
  return "Something went wrong. Your code is still here. Try again.";
}

export function logPill(status: LogStatus): { label: string; tone: "success" | "warning" | "danger" } {
  if (status === "REJECTED") return { label: "Not accepted", tone: "danger" };
  if (status === "EXCUSED") return { label: "Excused", tone: "warning" };
  return { label: "Present", tone: "success" };
}

/** "GRADE_2" → "Grade 2", for the stint card. Matches the web labels. */
export function gradeLabel(grade: string): string {
  const special: Record<string, string> = { PRE_K: "Pre-K", KINDERGARTEN: "Kindergarten", GRADE_6_PLUS: "6th Grade+" };
  if (special[grade]) return special[grade];
  return grade.replace("GRADE_", "Grade ").replace(/_/g, " ");
}

/** Only students can use this screen; the server checks the same thing. */
export function canViewOwnServing(role?: string | null): boolean {
  return role === "STUDENT";
}
