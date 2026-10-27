/**
 * How a current async student's Servants Prep attendance is read, shared by the
 * student's own progress screen, the staff student view, the mentee views and
 * the roll call. Pure: no network, no React.
 *
 * Mirrors lib/sunday-school-utils.ts (rotationAttendanceToDate,
 * rotationAttendanceSummary), the async branches of app/api/students/[id]/analytics
 * and analytics/batch, and docs/async-serving-rotations.md on the server. The
 * device never recomputes attendance: every percentage shown comes from the
 * server's `attendance.percentage` / `attendancePercentage`. What lives here is
 * wording, and which weeks are still ahead so they are never shown as missed.
 *
 * The rules the server enforces, which the screens must not contradict:
 *  - A current async student is assessed solely on the serving-rotation weeks
 *    that have started. Normal lessons never count, including lesson records
 *    from before the student became async.
 *  - Weeks still ahead cannot be missed, and no data is "no data", never 0%.
 *  - Completing all ten approved four-week rotations is a separate requirement
 *    from the 75% attendance goal.
 */

import type {
  PrepAnalyticsRotation,
  PrepAnalyticsSundaySchool,
  PrepRotationWeek,
} from "@stmark/contracts";
import { levelName, ROTATION_LEVELS } from "./async-rotations";

export type { PrepAnalyticsRotation, PrepAnalyticsSundaySchool, PrepRotationWeek };

/** The server's flag, and only when exactly true. A missing value is an in-person student. */
export function isAsyncRow(row: { isAsyncStudent?: boolean | null } | null | undefined): boolean {
  return row?.isAsyncStudent === true;
}

// ── Wording ─────────────────────────────────────────────────────────────────

export interface AttendanceTerms {
  /** The metric's name on a card or tile. */
  title: string;
  /** The compact label in a list row. */
  short: string;
  /** What the denominator counts. */
  unit: string;
  /** The graduation requirement's name. */
  requirement: string;
}

export function attendanceTerms(isAsync: boolean): AttendanceTerms {
  return isAsync
    ? { title: "Rotation attendance", short: "Rotation", unit: "rotation weeks", requirement: "Rotation attendance ≥ 75%" }
    : { title: "Attendance", short: "Att", unit: "lessons", requirement: "Attendance ≥ 75%" };
}

/**
 * "6 of 8 rotation weeks counted · Goal 75%". Nothing counted yet reads as
 * "No rotation weeks counted yet", never "0 of 0".
 */
export function attendanceCaption(
  attendance: { effectivePresent: number; totalLessons: number; percentage: number | null },
  isAsync: boolean,
  goal: number,
): string {
  const terms = attendanceTerms(isAsync);
  if (isAsync && (attendance.percentage === null || attendance.totalLessons <= 0)) {
    return `No ${terms.unit} counted yet · Goal ${goal}%`;
  }
  return `${attendance.effectivePresent} of ${attendance.totalLessons} ${terms.unit} counted · Goal ${goal}%`;
}

/** "Rotation 80%" / "Att 80%"; an async student with nothing counted yet reads "Rotation —". */
export function attendanceShort(row: { isAsyncStudent?: boolean | null; attendancePercentage: number | null }, format: (value: number | null) => string): string {
  return `${attendanceTerms(isAsyncRow(row)).short} ${format(row.attendancePercentage)}`;
}

// ── Rotation weeks ──────────────────────────────────────────────────────────

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Rotation weeks that have started by `now`. Same arithmetic as the server's elapsedRotationWeeks. */
export function elapsedRotationWeeks(startDate: string, totalWeeks: number, now: Date): number {
  const started = Math.floor((now.getTime() - new Date(startDate).getTime()) / WEEK_MS) + 1;
  return Math.max(0, Math.min(totalWeeks, started));
}

export type RotationWeekState = "present" | "excused" | "missed" | "upcoming";

export interface RotationWeekRow {
  weekNumber: number;
  /** "Oct 4" (a UTC calendar day, like every rotation date). */
  date: string;
  state: RotationWeekState;
  label: string;
}

export const ROTATION_WEEK_LABEL: Record<RotationWeekState, string> = {
  present: "Present",
  excused: "Excused",
  missed: "Not credited",
  upcoming: "Upcoming",
};

function weekState(week: PrepRotationWeek, elapsed: number): RotationWeekState {
  if (week.weekNumber > elapsed) return "upcoming";
  if (week.status === "VERIFIED" || week.status === "MANUAL") return "present";
  if (week.status === "EXCUSED") return "excused";
  // A week that has started and has no credit counts against the percentage
  // until a servant approves the signed form (which credits all four weeks).
  return "missed";
}

/** One row per rotation week. A week that has not started is "Upcoming" and never counts against the student. */
export function rotationWeekRows(
  rotation: Pick<PrepAnalyticsRotation, "startDate" | "totalWeeks" | "weeks">,
  now: Date,
): RotationWeekRow[] {
  const elapsed = elapsedRotationWeeks(rotation.startDate, rotation.totalWeeks, now);
  return [...rotation.weeks]
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .map((week) => {
      const state = weekState(week, elapsed);
      return {
        weekNumber: week.weekNumber,
        date: new Date(week.weekOf).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
        state,
        label: ROTATION_WEEK_LABEL[state],
      };
    });
}

/** The rotation being served now. A finished rotation is history, so it is not the active one. */
export function activeRotation(sundaySchool: PrepAnalyticsSundaySchool | null | undefined): PrepAnalyticsRotation | null {
  return sundaySchool?.assignments.find((assignment) => assignment.isActive) ?? null;
}

/** Distinct grades with an approved form: how many of the ten rotations are done. */
export function approvedRotationCount(sundaySchool: PrepAnalyticsSundaySchool | null | undefined): number {
  const levels = new Set<string>();
  for (const assignment of sundaySchool?.assignments ?? []) {
    const level = assignment.rotationForm?.level ?? assignment.class?.level ?? assignment.grade;
    if (assignment.rotationForm?.status === "APPROVED" && ROTATION_LEVELS.some((candidate) => candidate === level)) {
      levels.add(level);
    }
  }
  return levels.size;
}

export type RotationStateKind = "unassigned" | "upcoming" | "in-progress" | "complete";

export interface RotationState {
  kind: RotationStateKind;
  title: string;
  detail: string;
}

/** Where the student is in the cycle, in words: not assigned, not started, in progress, or finished. */
export function rotationState(sundaySchool: PrepAnalyticsSundaySchool | null | undefined, now: Date): RotationState {
  if (!sundaySchool || (sundaySchool.needsRotation && !sundaySchool.allMet)) {
    return {
      kind: "unassigned",
      title: "No rotation assigned yet",
      detail:
        "A Servants Prep servant assigns your first Sunday School class and start date. Until then no rotation weeks count. Ask a servant if you expected one.",
    };
  }
  const active = activeRotation(sundaySchool);
  if (!active) {
    return sundaySchool.allMet
      ? { kind: "complete", title: "All ten rotations approved", detail: "You have no new class assignment." }
      : {
          kind: "unassigned",
          title: "No rotation assigned yet",
          detail: "Your next rotation starts once a servant assigns your class. Ask a servant if you expected one.",
        };
  }
  const elapsed = elapsedRotationWeeks(active.startDate, active.totalWeeks, now);
  const grade = levelName(active.class?.level ?? active.grade);
  if (elapsed === 0) {
    const starts = new Date(active.startDate).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
    return {
      kind: "upcoming",
      title: `${grade} rotation starts ${starts}`,
      detail: "Weeks that haven't started can't be missed, so nothing counts against you yet.",
    };
  }
  return {
    kind: "in-progress",
    title: `${grade} · week ${elapsed} of ${active.totalWeeks}`,
    detail: "Only the weeks that have started count toward your rotation attendance.",
  };
}

export const ROTATION_WORKFLOW: readonly string[] = [
  "Attend four weeks in your assigned Sunday School class.",
  "Have each week signed on the printed attendance slip.",
  "After the fourth week, upload one photo or PDF of the completed form.",
  "A servant checks the signatures and approves it. Then your next grade begins.",
];

export const ROTATION_COMPLETION_NOTE =
  "Finishing all ten approved rotations is separate from the 75% rotation attendance goal. You need both.";

export const ASYNC_BASIS_NOTE = "Your attendance is based solely on rotation weeks. Normal lessons do not count.";

// ── Guidance ────────────────────────────────────────────────────────────────

export interface AsyncGuidance {
  status: "on-track" | "failing" | "no-data";
  message: string;
  detail: string;
}

/**
 * What an async student should do next about attendance. It never speaks of a
 * lesson-absence buffer or of recovering "in a row": those rules are for
 * in-person lessons and mean nothing for rotation weeks.
 */
export function asyncAttendanceGuidance(
  attendance: { percentage: number | null; met: boolean },
  sundaySchool: PrepAnalyticsSundaySchool | null | undefined,
  now: Date,
): AsyncGuidance {
  const state = rotationState(sundaySchool, now);
  const message =
    state.kind === "unassigned"
      ? "Ask a servant to assign your rotation"
      : state.kind === "complete"
        ? "All ten rotations are approved"
        : state.kind === "upcoming"
          ? state.title
          : "Attend your rotation and upload the signed four-week form";
  const status = attendance.percentage === null ? "no-data" : attendance.met ? "on-track" : "failing";
  return { status, message, detail: ASYNC_BASIS_NOTE };
}

// ── Completion requirement ──────────────────────────────────────────────────

export interface RotationRequirement {
  title: string;
  caption: string;
  met: boolean;
  /** The pill's words: this is a progress item, not an attendance shortfall. */
  metLabel: string;
  unmetLabel: string;
}

/** The ten-rotation requirement row. Separate from, and never merged into, the 75% attendance row. */
export function rotationRequirement(
  sundaySchool: PrepAnalyticsSundaySchool | null | undefined,
  met: boolean,
): RotationRequirement {
  const needsRotation = !!sundaySchool?.needsRotation && !met;
  const approved = approvedRotationCount(sundaySchool);
  return {
    title: needsRotation ? "Sunday School rotation · not assigned yet" : "All ten four-week rotations approved",
    caption: needsRotation
      ? "Ask a servant to assign your rotation"
      : `${approved} of ${ROTATION_LEVELS.length} rotations approved`,
    met,
    metLabel: "Complete",
    unmetLabel: needsRotation ? "Not assigned" : "In progress",
  };
}
