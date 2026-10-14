/**
 * Pure logic for the Servants Prep Roster list and the Async student detail
 * screen (SMM-39), pulled out of the screen components so filtering,
 * mentor-workload grouping, Sunday-School-serving progress math, and the
 * graduation-note requirement are unit-testable without rendering native UI.
 */

export { canManageAttendance as canManageEnrollments } from "./prep-attendance";

export type EnrollmentStatus = "ACTIVE" | "GRADUATED" | "WITHDRAWN";
export type RosterEnrollment = {
  id: string;
  studentId: string;
  isActive: boolean;
  status: EnrollmentStatus;
  yearLevel: string | null;
  isAsyncStudent: boolean;
  student: { id: string; name: string };
  mentor: { id: string; name: string } | null;
};

export type RosterSegment = "active" | "async" | "all";

export function filterRosterSegment<T extends RosterEnrollment>(rows: T[], segment: RosterSegment): T[] {
  if (segment === "active") return rows.filter((r) => r.isActive);
  if (segment === "async") return rows.filter((r) => r.isActive && r.isAsyncStudent);
  return rows;
}

export function filterRosterYear<T extends { yearLevel: string | null }>(rows: T[], yearLevel: string | null): T[] {
  if (!yearLevel) return rows;
  return rows.filter((r) => r.yearLevel === yearLevel);
}

export function searchRoster<T extends { student: { name: string } }>(rows: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.student.name.toLowerCase().includes(q));
}

export type MentorWorkload = { id: string; name: string; count: number };

export function mentorWorkload(rows: RosterEnrollment[]): MentorWorkload[] {
  const workload = new Map<string, MentorWorkload>();
  for (const r of rows) {
    if (!r.isActive || !r.mentor) continue;
    const entry = workload.get(r.mentor.id) ?? { id: r.mentor.id, name: r.mentor.name, count: 0 };
    entry.count += 1;
    workload.set(r.mentor.id, entry);
  }
  return [...workload.values()].sort((a, b) => b.count - a.count);
}

/** The eligible-to-be-a-mentor roles — mirrors lib/roles.ts's MENTOR_ELIGIBLE_ROLES on the web. */
export const MENTOR_ELIGIBLE_ROLES = ["SUPER_ADMIN", "PRIEST", "SERVANT_PREP", "MENTOR"];
export function isEligibleMentorRole(role: string): boolean {
  return MENTOR_ELIGIBLE_ROLES.includes(role);
}

export type AddableUser = { id: string; name: string; role: string };

/** Existing STUDENT accounts with no enrollment yet — the only honest source for "Add" (enrolling creates no new User). */
export function unenrolledStudents(allStudents: AddableUser[], enrollments: { studentId: string }[]): AddableUser[] {
  const enrolledIds = new Set(enrollments.map((e) => e.studentId));
  return allStudents.filter((u) => !enrolledIds.has(u.id));
}

/**
 * Whether a graduation note is required: the model only calls it required
 * "if graduating without meeting requirements (exception)" — so it's
 * required exactly when the student isn't actually graduation-eligible.
 */
export function graduationNoteRequired(graduationEligible: boolean | null): boolean {
  return graduationEligible === false;
}
