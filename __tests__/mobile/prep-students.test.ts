import { describe, expect, it } from "vitest";
import {
  PREP_ADMIN_ROLES,
  canManageStudentRecord,
  canViewStudentRoster,
  eligibilityLabel,
  eligibilityTone,
  filterBySegment,
  recentActivity,
  searchStudents,
  segmentCounts,
} from "../../apps/mobile/src/data/prep-students";

describe("Prep Students list + detail (SMM-34)", () => {
  describe("happy path", () => {
    it("counts the Active/Review/All segments from the real (already active-only) roster", () => {
      const students = [
        { graduationEligible: true },
        { graduationEligible: false },
        { graduationEligible: false },
      ];
      expect(segmentCounts(students)).toEqual({ active: 3, review: 2, all: 3 });
    });

    it("filters to only the review segment; active/all pass everything through", () => {
      const students = [{ graduationEligible: true }, { graduationEligible: false }];
      expect(filterBySegment(students, "review")).toHaveLength(1);
      expect(filterBySegment(students, "active")).toHaveLength(2);
      expect(filterBySegment(students, "all")).toHaveLength(2);
    });

    it("colors eligibility success/warning and labels it Eligible/Review", () => {
      expect(eligibilityTone(true)).toBe("success");
      expect(eligibilityLabel(true)).toBe("Eligible");
      expect(eligibilityTone(false)).toBe("warning");
      expect(eligibilityLabel(false)).toBe("Review");
    });

    it("searches by a case-insensitive substring of the student's name", () => {
      const students = [
        { studentId: "1", studentName: "Andrew Shehata" },
        { studentId: "2", studentName: "Anstasia Fam" },
      ];
      expect(searchStudents(students, "shehata")).toEqual([students[0]]);
      expect(searchStudents(students, "an")).toHaveLength(2);
      expect(searchStudents(students, "")).toHaveLength(2);
    });

    it("merges attendance and exam history into one date-sorted, capped feed", () => {
      const attendance = [
        { id: "a1", status: "PRESENT" as const, lesson: { scheduledDate: "2026-09-25", lessonNumber: 1 } },
      ];
      const exams = [
        { id: "e1", percentage: 81, exam: { examDate: "2026-10-01", examSection: { displayName: "Year 2" } } },
      ];
      const feed = recentActivity(attendance, exams);
      expect(feed.map((e) => e.id)).toEqual(["e1", "a1"]);
    });

    it("caps the recent-activity feed at the given limit", () => {
      const attendance = Array.from({ length: 10 }, (_, i) => ({
        id: `a${i}`,
        status: "PRESENT" as const,
        lesson: { scheduledDate: `2026-09-${10 + i}`, lessonNumber: i },
      }));
      expect(recentActivity(attendance, [], 3)).toHaveLength(3);
    });
  });

  describe("highest-risk path: roster visibility and write access are role-gated", () => {
    it.each(PREP_ADMIN_ROLES)("lets %s view the roster", (role) => {
      expect(canViewStudentRoster(role)).toBe(true);
    });
    it("also lets MENTOR view the roster (their own mentees, enforced server-side)", () => {
      expect(canViewStudentRoster("MENTOR")).toBe(true);
    });
    it.each(["STUDENT", "SERVANT", "PARENT"])("hides the roster from %s", (role) => {
      expect(canViewStudentRoster(role)).toBe(false);
    });
    it("hides the roster with no role at all", () => {
      expect(canViewStudentRoster(undefined)).toBe(false);
      expect(canViewStudentRoster(null)).toBe(false);
    });

    it("lets SUPER_ADMIN and SERVANT_PREP edit a student record", () => {
      expect(canManageStudentRecord("SUPER_ADMIN")).toBe(true);
      expect(canManageStudentRecord("SERVANT_PREP")).toBe(true);
    });
    it.each(["PRIEST", "MENTOR", "STUDENT", "SERVANT", "PARENT"])(
      "denies %s edit access — PRIEST is read-only even though it's an admin role, and a mentor never edits enrollment records",
      (role) => {
        expect(canManageStudentRecord(role)).toBe(false);
      },
    );
  });
});
