// Attendance → Individual history, read-only (GET /api/sunday-school/attendance/history).
// Pure helpers: no network, no React. Counts and rate are the server's; this file
// never recomputes them. A blank cell is unrecorded, not an absence.

import type {
  AttendanceStatus,
  IndividualAttendanceChild,
  IndividualAttendanceResponse,
} from "@stmark/contracts";
import { getChildFullName, organizeAttendanceRoster, type AttendanceRosterNameOrder } from "@stmark/domain";

export type { IndividualAttendanceChild, IndividualAttendanceResponse };

/** The one request that fills the screen and the per-child sheet. */
export function individualAttendancePath(classId: string): string {
  return `/api/sunday-school/attendance/history?classId=${encodeURIComponent(classId)}`;
}

/** Cache scope: viewer (and View as original), then class. Another account never reads this answer. */
export function individualAttendanceScope(
  viewer: { id: string; originalId?: string | null },
  classId: string,
): string {
  return ["attendance-history", viewer.originalId ? `${viewer.originalId}>${viewer.id}` : viewer.id, classId].join(":");
}

export function individualAttendanceRoute(classId: string) {
  return { pathname: "/attendance-history/[classId]", params: { classId } } as const;
}

export function childAttendanceRoute(classId: string, child: { id: string; firstName: string; lastName: string }) {
  return {
    pathname: "/attendance-child/[childId]",
    params: { childId: child.id, classId, name: getChildFullName(child) },
  } as const;
}

/** An answer is shown only for the class that was asked for. */
export function isHistoryForClass(data: unknown, classId: string): data is IndividualAttendanceResponse {
  if (!data || typeof data !== "object") return false;
  const value = data as Partial<IndividualAttendanceResponse>;
  return value.classroom?.id === classId && Array.isArray(value.dates) && Array.isArray(value.children);
}

export type ClassHistoryProblem = "denied" | "gone" | "retry";

export function classHistoryProblem(status: number | undefined): ClassHistoryProblem {
  if (status === 403) return "denied";
  if (status === 404) return "gone";
  return "retry";
}

export const CLASS_HISTORY_PROBLEM_MESSAGE: Record<ClassHistoryProblem, string> = {
  denied: "You don't have access to this class's attendance history.",
  gone: "This class is no longer active.",
  retry: "Couldn't load attendance history.",
};

export const NO_MEETINGS_MESSAGE = "No past meetings are available for this class yet.";
export const RATE_NOTE = "Rate uses saved marks only. Late counts half; excused and unrecorded meetings are left out.";

// ── Marks ───────────────────────────────────────────────────────────────────

export const MARK: Record<AttendanceStatus, { label: string; short: string }> = {
  PRESENT: { label: "Present", short: "P" },
  LATE: { label: "Late", short: "L" },
  ABSENT: { label: "Absent", short: "A" },
  EXCUSED: { label: "Excused", short: "E" },
};

export const UNRECORDED = "Unrecorded";

export function markLabel(status: AttendanceStatus | undefined): string {
  return status ? MARK[status].label : UNRECORDED;
}

export function rateText(rate: number | null | undefined): string {
  return typeof rate === "number" && Number.isFinite(rate) ? `${Math.round(rate)}%` : "—";
}

// ── Rows ────────────────────────────────────────────────────────────────────

/** Case-insensitive match on the full name, as the web view does. */
export function filterChildren(
  children: readonly IndividualAttendanceChild[],
  query: string,
): IndividualAttendanceChild[] {
  const q = query.trim().toLowerCase();
  return q ? children.filter((child) => getChildFullName(child).toLowerCase().includes(q)) : [...children];
}

/** Search, then sort by first or last name (same collation as Take attendance). */
export function visibleChildren(
  history: Pick<IndividualAttendanceResponse, "children">,
  options: { query: string; nameOrder: AttendanceRosterNameOrder },
): IndividualAttendanceChild[] {
  return organizeAttendanceRoster(filterChildren(history.children, options.query), {
    nameOrder: options.nameOrder,
    groupByGender: false,
  })[0].entries;
}

/** Dates newest first, each with the child's saved mark or undefined (unrecorded). */
export function childMeetings(
  history: Pick<IndividualAttendanceResponse, "dates">,
  child: Pick<IndividualAttendanceChild, "attendance">,
): { date: string; status: AttendanceStatus | undefined }[] {
  return [...history.dates].reverse().map((date) => ({ date, status: child.attendance[date] }));
}

/** The latest few meetings for a row's strip, newest first. */
export const STRIP_LENGTH = 6;
export function recentMeetings(
  history: Pick<IndividualAttendanceResponse, "dates">,
  child: Pick<IndividualAttendanceChild, "attendance">,
  length: number = STRIP_LENGTH,
) {
  return childMeetings(history, child).slice(0, length);
}

export function formerLabel(child: Pick<IndividualAttendanceChild, "onRoster">): string {
  return child.onRoster ? "On roster" : "Former roster member";
}

/** "Present 5, Late 1, Absent 2. Attendance 71%" for a screen reader (Excused only when there is one). */
export function childSpoken(child: Pick<IndividualAttendanceChild, "counts" | "rate">): string {
  const { present, late, absent, excused } = child.counts;
  const parts = [`Present ${present}`, `Late ${late}`, `Absent ${absent}`];
  if (excused) parts.push(`Excused ${excused}`);
  return `${parts.join(", ")}. Attendance ${rateText(child.rate)}`;
}

export function meetingDateLabel(date: string, year = true): string {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}
