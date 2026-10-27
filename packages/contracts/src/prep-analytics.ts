// Mirrors the attendance fields of GET /api/students/[id]/analytics and
// GET /api/students/analytics/batch (app/api/students/...). Type-only: no server
// code reaches native bundles.
//
// For a current async student these fields carry ROTATION data, not lesson data:
// `percentage`, `presentCount`, `absentCount` and the totals count only the
// serving-rotation weeks that have started. Normal Servants Prep lessons never
// enter them, however much lesson attendance was recorded before the student
// became async (docs/async-serving-rotations.md, "Lesson attendance exemption").

/** A rotation week's stored status. A week with no log is `null`. */
export type RotationWeekLogStatus = "VERIFIED" | "MANUAL" | "EXCUSED" | "REJECTED";

export interface PrepRotationWeek {
  weekNumber: number;
  weekOf: string;
  status: RotationWeekLogStatus | null;
}

/** Attendance across the weeks that have started; `null` before week one or when every elapsed week is excused. */
export interface PrepRotationAttendance {
  present: number;
  excused: number;
  absent: number;
  effectiveTotal: number;
  percentage: number;
  met: boolean;
}

export interface PrepAnalyticsRotation {
  id: string;
  class: { level: string } | null;
  rotationForm: { status: string; level?: string } | null;
  grade: string;
  yearLevel: string | null;
  academicYear: { id: string; name: string };
  totalWeeks: number;
  startDate: string;
  isActive: boolean;
  attendance: PrepRotationAttendance | null;
  weeks: PrepRotationWeek[];
}

/** Present only for an async student. */
export interface PrepAnalyticsSundaySchool {
  assignments: PrepAnalyticsRotation[];
  /** No active rotation has been assigned yet. */
  needsRotation: boolean;
  /** All ten approved rotations (the completion requirement, separate from the 75% attendance metric). */
  allMet: boolean;
}

export interface PrepAnalyticsAttendance {
  /** Rotation weeks for an async student, lessons otherwise. Excused weeks are already removed. */
  totalLessons: number;
  allLessons: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  excusedCount: number;
  effectivePresent: number;
  /** `null` when nothing countable has happened yet; never 0 for "no data". */
  percentage: number | null;
  met: boolean;
  required: number;
}

export interface PrepAnalyticsGraduation {
  eligible: boolean;
  attendanceMet: boolean;
  overallAverageMet: boolean;
  allSectionsPassing: boolean;
  /** Async students only: all ten four-week rotations approved. */
  sundaySchoolMet?: boolean;
}

/** One row of GET /api/students/analytics/batch (the fields the app reads). */
export interface PrepStudentAnalyticsRow {
  studentId: string;
  studentName: string;
  yearLevel: string | null;
  isAsyncStudent?: boolean;
  /** Rotation attendance when `isAsyncStudent`, lesson attendance otherwise. */
  attendancePercentage: number | null;
  attendanceMet: boolean;
  totalLessons: number;
  examAverage: number | null;
  examCount: number;
  graduationEligible: boolean;
  /** Async students only. */
  sundaySchoolMet?: boolean;
}
