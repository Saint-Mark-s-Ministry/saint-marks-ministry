import { describe, expect, it } from "vitest";
import {
  canManageEnrollments,
  filterRosterSegment,
  filterRosterYear,
  graduationNoteRequired,
  isEligibleMentorRole,
  mentorWorkload,
  searchRoster,
  ssProgressSummary,
  ssWeekStates,
  unenrolledStudents,
  type RosterEnrollment,
} from "../../apps/mobile/src/data/prep-roster";

const enrollment = (overrides: Partial<RosterEnrollment>): RosterEnrollment => ({
  studentId: "s1",
  isActive: true,
  status: "ACTIVE",
  yearLevel: "YEAR_2",
  isAsyncStudent: false,
  student: { id: "s1", name: "Student" },
  mentor: null,
  ...overrides,
});

describe("Roster + async student detail (SMM-39)", () => {
  describe("happy path", () => {
    it("filters by segment: active, async (a subset of active), and all", () => {
      const rows = [
        enrollment({ studentId: "a", isActive: true, isAsyncStudent: false }),
        enrollment({ studentId: "b", isActive: true, isAsyncStudent: true }),
        enrollment({ studentId: "c", isActive: false, status: "WITHDRAWN" }),
      ];
      expect(filterRosterSegment(rows, "active").map((r) => r.studentId)).toEqual(["a", "b"]);
      expect(filterRosterSegment(rows, "async").map((r) => r.studentId)).toEqual(["b"]);
      expect(filterRosterSegment(rows, "all")).toHaveLength(3);
    });

    it("filters by year level and searches by student name", () => {
      const rows = [
        enrollment({ studentId: "a", yearLevel: "YEAR_1", student: { id: "a", name: "Andrew" } }),
        enrollment({ studentId: "b", yearLevel: "YEAR_2", student: { id: "b", name: "Beshoy" } }),
      ];
      expect(filterRosterYear(rows, "YEAR_1").map((r) => r.studentId)).toEqual(["a"]);
      expect(filterRosterYear(rows, null)).toHaveLength(2);
      expect(searchRoster(rows, "besh").map((r) => r.studentId)).toEqual(["b"]);
    });

    it("computes mentor workload only from active enrollments, sorted by count", () => {
      const rows = [
        enrollment({ studentId: "a", mentor: { id: "m1", name: "Mentor One" } }),
        enrollment({ studentId: "b", mentor: { id: "m1", name: "Mentor One" } }),
        enrollment({ studentId: "c", mentor: { id: "m2", name: "Mentor Two" } }),
        enrollment({ studentId: "d", isActive: false, status: "WITHDRAWN", mentor: { id: "m2", name: "Mentor Two" } }),
      ];
      expect(mentorWorkload(rows)).toEqual([
        { id: "m1", name: "Mentor One", count: 2 },
        { id: "m2", name: "Mentor Two", count: 1 },
      ]);
    });

    it("recognizes the mentor-eligible roles", () => {
      expect(isEligibleMentorRole("MENTOR")).toBe(true);
      expect(isEligibleMentorRole("SERVANT_PREP")).toBe(true);
      expect(isEligibleMentorRole("STUDENT")).toBe(false);
      expect(isEligibleMentorRole("PARENT")).toBe(false);
    });

    it("finds existing student accounts with no enrollment yet", () => {
      const students = [
        { id: "a", name: "A", role: "STUDENT" },
        { id: "b", name: "B", role: "STUDENT" },
      ];
      expect(unenrolledStudents(students, [{ studentId: "a" }]).map((s) => s.id)).toEqual(["b"]);
    });

    it("builds a per-week serving state array (present/excused/absent/upcoming)", () => {
      const logs = [
        { weekNumber: 1, status: "VERIFIED" },
        { weekNumber: 2, status: "MANUAL" },
        { weekNumber: 3, status: "EXCUSED" },
      ];
      expect(ssWeekStates(logs, 6)).toEqual(["present", "present", "excused", "upcoming", "upcoming", "upcoming"]);
    });

    it("summarizes serving progress, excused weeks shrinking the denominator", () => {
      const logs = [
        { weekNumber: 1, status: "VERIFIED" },
        { weekNumber: 2, status: "EXCUSED" },
      ];
      expect(ssProgressSummary(logs, 6)).toEqual({ present: 1, of: 5 });
    });
  });

  describe("highest-risk path", () => {
    it.each(["SUPER_ADMIN", "SERVANT_PREP"])("lets %s enroll/transition/edit students", (role) => {
      expect(canManageEnrollments(role)).toBe(true);
    });
    it.each(["PRIEST", "MENTOR", "STUDENT", "SERVANT", "PARENT"])("denies %s write access", (role) => {
      expect(canManageEnrollments(role)).toBe(false);
    });

    it("requires a graduation note only when the student is not actually eligible — the model's own exception rule", () => {
      expect(graduationNoteRequired(true)).toBe(false);
      expect(graduationNoteRequired(false)).toBe(true);
      expect(graduationNoteRequired(null)).toBe(false); // no data yet — don't block on an unknown
    });
  });
});
