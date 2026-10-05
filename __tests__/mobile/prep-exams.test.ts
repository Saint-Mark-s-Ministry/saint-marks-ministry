import { describe, expect, it } from "vitest";
import {
  canManageExams,
  filterExamsByYear,
  filterScoreRoster,
  groupExamsByYear,
  scoreRosterCounts,
  shouldAdvanceFocus,
  validateScore,
  type ExamListItem,
} from "../../apps/mobile/src/data/prep-exams";

const exam = (overrides: Partial<ExamListItem>): ExamListItem => ({
  id: "e1",
  examDate: "2026-10-30",
  totalPoints: 100,
  yearLevel: "YEAR_2",
  examSection: { displayName: "Bible Studies" },
  academicYear: { id: "y1", name: "2025-26" },
  _count: { scores: 10 },
  ...overrides,
});

describe("Prep Exams + score entry (SMM-37)", () => {
  describe("happy path", () => {
    it("validates a score exactly like the server does", () => {
      expect(validateScore("86", 100)).toEqual({ value: 86, error: null });
      expect(validateScore("", 100)).toEqual({ value: null, error: null }); // not entered, not an error
      expect(validateScore("abc", 100)).toEqual({ value: null, error: "Score must be a valid number" });
      expect(validateScore("-5", 100)).toEqual({ value: null, error: "Score cannot be negative" });
      expect(validateScore("150", 100)).toEqual({ value: null, error: "Score cannot exceed total points (100)" });
      expect(validateScore("100", 100)).toEqual({ value: 100, error: null }); // exactly the max is fine
    });

    it("groups exams by academic year, newest first, summing scores recorded", () => {
      const exams = [
        exam({ id: "a", academicYear: { id: "y25", name: "2025-26" }, _count: { scores: 100 } }),
        exam({ id: "b", academicYear: { id: "y25", name: "2025-26" }, _count: { scores: 44 } }),
        exam({ id: "c", academicYear: { id: "y24", name: "2024-25" }, _count: { scores: 34 } }),
      ];
      const groups = groupExamsByYear(exams);
      expect(groups.map((g) => g.academicYear.name)).toEqual(["2025-26", "2024-25"]);
      expect(groups[0].exams).toHaveLength(2);
      expect(groups[0].totalScores).toBe(144);
    });

    it("filters by year level, with BOTH-level exams showing in either year filter", () => {
      const exams = [
        exam({ id: "a", yearLevel: "YEAR_2" }),
        exam({ id: "b", yearLevel: "YEAR_1" }),
        exam({ id: "c", yearLevel: "BOTH" }),
      ];
      expect(filterExamsByYear(exams, "YEAR_2").map((e) => e.id)).toEqual(["a", "c"]);
      expect(filterExamsByYear(exams, "YEAR_1").map((e) => e.id)).toEqual(["b", "c"]);
      expect(filterExamsByYear(exams, "all")).toHaveLength(3);
    });

    it("auto-advances focus after two digits, except '10' which might become '100'", () => {
      expect(shouldAdvanceFocus("8", 100)).toBe(false);
      expect(shouldAdvanceFocus("86", 100)).toBe(true);
      expect(shouldAdvanceFocus("10", 100)).toBe(false);
      expect(shouldAdvanceFocus("100", 100)).toBe(true);
      expect(shouldAdvanceFocus("10", 60)).toBe(true); // max is 2 digits, so "10" is already the max length
    });

    it("filters and counts the score-entry roster segments", () => {
      const rows = [
        { studentId: "1", score: 86, mentorId: "m1" },
        { studentId: "2", score: null, mentorId: "m1" },
        { studentId: "3", score: 70, mentorId: "m2" },
      ];
      expect(scoreRosterCounts(rows, "m1")).toEqual({ all: 3, notEntered: 1, mentees: 2 });
      expect(filterScoreRoster(rows, "notEntered").map((r) => r.studentId)).toEqual(["2"]);
      expect(filterScoreRoster(rows, "mentees", "m1").map((r) => r.studentId)).toEqual(["1", "2"]);
    });
  });

  describe("highest-risk path: only admins can manage exams/scores, PRIEST is read-only", () => {
    it.each(["SUPER_ADMIN", "SERVANT_PREP"])("lets %s create exams and enter scores", (role) => {
      expect(canManageExams(role)).toBe(true);
    });
    it.each(["PRIEST", "MENTOR", "STUDENT", "SERVANT", "PARENT"])(
      "denies %s write access — a mentor can view their mentees' scores but never edit them",
      (role) => {
        expect(canManageExams(role)).toBe(false);
      },
    );
    it("denies write access with no role at all", () => {
      expect(canManageExams(undefined)).toBe(false);
    });
  });
});
