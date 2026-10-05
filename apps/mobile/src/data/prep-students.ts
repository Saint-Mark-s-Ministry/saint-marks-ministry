/**
 * Pure logic for the Servants Prep Students list + detail (SMM-34), pulled
 * out of the screen components so segmenting, eligibility, permission
 * gating, and the recent-activity merge are unit-testable without rendering
 * native UI.
 */

import { PREP_ADMIN_ROLES, isAdminLike } from "./prep-home";

export { PREP_ADMIN_ROLES, isAdminLike };

/** Edit (and other write actions) are admin-only, and PRIEST is read-only even among admins — mirrors lib/roles.ts's canManageEnrollments on the web. */
export const STUDENT_MANAGE_ROLES = ["SUPER_ADMIN", "SERVANT_PREP"];
export function canManageStudentRecord(role?: string | null): boolean {
  return !!role && STUDENT_MANAGE_ROLES.includes(role);
}

/** The roster and detail screens are visible to admins and to mentors (their own mentees only, enforced server-side). */
export function canViewStudentRoster(role?: string | null): boolean {
  return isAdminLike(role) || role === "MENTOR";
}

export type StudentForSegment = { graduationEligible: boolean };
export type StudentSegment = "active" | "review" | "all";

/**
 * "Active" and "All" render the same list: /api/students/analytics/batch
 * only ever returns actively-enrolled students, so there's no separate
 * inactive roster to distinguish them with on real data. Kept as two segments
 * anyway to match the design source's segmented control; not a bug.
 */
export function segmentCounts(students: StudentForSegment[]) {
  const total = students.length;
  const review = students.filter((s) => !s.graduationEligible).length;
  return { active: total, review, all: total };
}

export function filterBySegment<T extends StudentForSegment>(students: T[], segment: StudentSegment): T[] {
  return segment === "review" ? students.filter((s) => !s.graduationEligible) : students;
}

export function eligibilityTone(eligible: boolean): "success" | "warning" {
  return eligible ? "success" : "warning";
}
export function eligibilityLabel(eligible: boolean): "Eligible" | "Review" {
  return eligible ? "Eligible" : "Review";
}

export type StudentSearchable = { studentId: string; studentName: string };
export function searchStudents<T extends StudentSearchable>(students: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return students;
  return students.filter((s) => s.studentName.toLowerCase().includes(q));
}

export type AttendanceActivity = {
  kind: "attendance";
  id: string;
  date: string;
  status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";
  lessonNumber: number;
};
export type ExamActivity = {
  kind: "exam";
  id: string;
  date: string;
  percentage: number;
  sectionName: string;
};
export type RecentActivity = AttendanceActivity | ExamActivity;

export type AttendanceRecordInput = {
  id: string;
  status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";
  lesson: { scheduledDate: string; lessonNumber: number };
};
export type ExamScoreInput = {
  id: string;
  percentage: number;
  exam: { examDate: string; examSection?: { displayName: string } | null };
};

/**
 * Merges attendance + exam-score history into one date-sorted feed.
 * Confession-period reminders ("Due Oct 31") from the design source are
 * left out — there's no Confession-tracking model/endpoint in this app
 * (confirmed: no `ConfessionPeriod`/`ConfessionRecord` in prisma/schema.prisma,
 * no /api/confession* route), so it isn't real data to show.
 */
export function recentActivity(
  attendance: AttendanceRecordInput[],
  examScores: ExamScoreInput[],
  limit = 8,
): RecentActivity[] {
  const attendanceActivity: AttendanceActivity[] = attendance.map((r) => ({
    kind: "attendance",
    id: r.id,
    date: r.lesson.scheduledDate,
    status: r.status,
    lessonNumber: r.lesson.lessonNumber,
  }));
  const examActivity: ExamActivity[] = examScores.map((s) => ({
    kind: "exam",
    id: s.id,
    date: s.exam.examDate,
    percentage: s.percentage,
    sectionName: s.exam.examSection?.displayName ?? "All sections",
  }));
  return [...attendanceActivity, ...examActivity]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}
