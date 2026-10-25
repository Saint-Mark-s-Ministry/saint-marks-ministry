// The read-only student history that opens from a saved child's name
// (GET /api/sunday-school/children/[id]/history). Pure helpers: no network,
// no React. Records are identified by program and ID, never by the name shown;
// two children can share a name, and a name is only a label.
//
// Only Sunday School has a history endpoint. Servants Prep keeps its normal
// name links, grading and mentor views (docs/student-history.md: "There is no
// Prep history endpoint").

import type {
  AttendanceCounts,
  AttendanceStatus,
  StudentHistory,
  StudentHistoryProgram,
  StudentHistoryTarget,
  SundaySchoolPhoneCallOutcome,
  SundaySchoolVisitationStatus,
} from "@stmark/contracts";

export type { StudentHistory, StudentHistoryProgram, StudentHistoryTarget };

export const STUDENT_HISTORY_PROGRAMS: readonly StudentHistoryProgram[] = ["sunday-school"];

export function isStudentHistoryProgram(value: unknown): value is StudentHistoryProgram {
  return typeof value === "string" && (STUDENT_HISTORY_PROGRAMS as readonly string[]).includes(value);
}

// ── Opening the sheet ───────────────────────────────────────────────────────

/** The one request that fills the sheet. The ID is encoded; nothing about the name is sent. */
export function studentHistoryPath(target: Pick<StudentHistoryTarget, "id" | "program">): string {
  return `/api/sunday-school/children/${encodeURIComponent(target.id)}/history`;
}

/**
 * The cache scope for one history: viewer, program and ID. A different
 * signed-in person, a View as session, another program, or another child can
 * never be served this one's answer.
 */
export function studentHistoryScope(
  viewer: { id: string; originalId?: string | null },
  target: Pick<StudentHistoryTarget, "id" | "program">,
): string {
  return ["history", viewer.originalId ? `${viewer.originalId}>${viewer.id}` : viewer.id, target.program, target.id].join(":");
}

/**
 * The route that presents the sheet. `name` is a loading placeholder for the
 * header only; the screen identifies the child by `id` and `program`.
 */
export function studentHistoryRoute(target: StudentHistoryTarget) {
  return {
    pathname: "/student-history/[id]",
    params: { id: target.id, program: target.program, name: target.name },
  } as const;
}

/** Route params back into a target, or null when they don't name a known program and a child ID. */
export function parseStudentHistoryParams(params: {
  id?: string | string[];
  program?: string | string[];
  name?: string | string[];
}): StudentHistoryTarget | null {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const id = first(params.id)?.trim();
  const program = first(params.program) ?? "sunday-school";
  if (!id || !isStudentHistoryProgram(program)) return null;
  return { id, program, name: first(params.name)?.trim() || "Student" };
}

/** An answer is only shown for the record that was asked for: same ID, same program. */
export function isHistoryFor(
  history: unknown,
  target: Pick<StudentHistoryTarget, "id" | "program">,
): history is StudentHistory {
  if (!history || typeof history !== "object") return false;
  const value = history as Partial<StudentHistory>;
  return (
    value.id === target.id &&
    value.program === target.program &&
    !!value.attendance &&
    Array.isArray(value.attendance.records) &&
    Array.isArray(value.visitations) &&
    Array.isArray(value.phoneCalls) &&
    !!value.notes
  );
}

// ── Failures ────────────────────────────────────────────────────────────────

export type HistoryProblem = "denied" | "gone" | "retry";

/** What a failed request means for the person: refused, no longer there, or worth trying again. */
export function historyProblem(status: number | undefined): HistoryProblem {
  if (status === 403) return "denied";
  if (status === 404) return "gone";
  return "retry";
}

export const HISTORY_PROBLEM_MESSAGE: Record<HistoryProblem, string> = {
  denied: "You don't have access to this student's history.",
  gone: "This student's record is no longer available.",
  retry: "Couldn't load student history.",
};

// ── Display ─────────────────────────────────────────────────────────────────

export type HistoryTab = "attendance" | "notes" | "visitations";

export const HISTORY_TABS: { id: HistoryTab; label: string }[] = [
  { id: "attendance", label: "Attendance" },
  { id: "notes", label: "Notes" },
  { id: "visitations", label: "Visitations" },
];

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  LATE: "Late",
  ABSENT: "Absent",
  EXCUSED: "Excused",
};

export type Tone = "success" | "warning" | "danger" | "muted";

export const ATTENDANCE_TONE: Record<AttendanceStatus, Tone> = {
  PRESENT: "success",
  LATE: "warning",
  ABSENT: "danger",
  EXCUSED: "muted",
};

export function rateLabel(rate: number | null | undefined): string {
  return typeof rate === "number" && Number.isFinite(rate) ? `${Math.round(rate)}%` : "—";
}

/** Colour for the attendance rate, matching the child profile's thresholds. */
export function rateTone(rate: number | null | undefined): Tone {
  if (typeof rate !== "number" || !Number.isFinite(rate)) return "muted";
  return rate >= 75 ? "success" : rate >= 50 ? "warning" : "danger";
}

export function countRows(counts: AttendanceCounts): { label: string; value: number }[] {
  return [
    { label: "Present", value: counts.present },
    { label: "Late", value: counts.late },
    { label: "Absent", value: counts.absent },
    { label: "Excused", value: counts.excused },
  ];
}

/** "3 present, 1 late, 0 absent, 0 excused. Attendance 88%" for a screen reader. */
export function attendanceSpoken(history: Pick<StudentHistory, "attendance">): string {
  const { counts, rate } = history.attendance;
  return `${counts.present} present, ${counts.late} late, ${counts.absent} absent, ${counts.excused} excused. Attendance ${rateLabel(rate)}`;
}

export const VISITATION_LABEL: Record<SundaySchoolVisitationStatus, string> = {
  DONE: "Visited",
  NOT_DONE: "Not done",
};

export const CALL_OUTCOME_LABEL: Record<SundaySchoolPhoneCallOutcome, string> = {
  CONNECTED: "Connected",
  NO_ANSWER: "No answer",
  LEFT_VOICEMAIL: "Left voicemail",
  OTHER: "Other",
};

export function visitationTone(status: SundaySchoolVisitationStatus): Tone {
  return status === "DONE" ? "success" : "warning";
}

/** A visit's date: when it happened, else when it was recorded. */
export function visitationDate(visit: { visitedAt: string | null; createdAt: string }): string {
  return visit.visitedAt ?? visit.createdAt;
}

/** The most recent completed visit, or null. The API returns newest first. */
export function lastVisit(history: Pick<StudentHistory, "visitations">) {
  return history.visitations.find((visit) => visit.status === "DONE") ?? null;
}

/** The viewer-facing line under the name: "Sunday School · Grade 3 Girls". */
export function historySubtitle(history: Pick<StudentHistory, "subtitle">): string {
  return history.subtitle;
}

export const CONFIDENTIAL_NOTES_NOTE =
  "Confidential pastoral notes are kept separate and are not part of this history.";

export const PROGRAM_BOUNDARY_NOTE =
  "Sunday School records only. A linked Servants Prep account does not share its records here.";
