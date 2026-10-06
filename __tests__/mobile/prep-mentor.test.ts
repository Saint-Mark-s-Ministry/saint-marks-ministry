import { describe, expect, it } from "vitest";
import {
  aggregateSectionAverages,
  canViewMentees,
  canViewPhone,
  diff,
  filterMentees,
  formatDiff,
  formatPercent,
  graduationCounts,
  isReassignmentError,
  menteesAverage,
  riskLabel,
  searchMentees,
  sectionDiffs,
  sortMentees,
  worstFailingSection,
} from "../../apps/mobile/src/data/prep-mentor";

const mentee = (overrides: Partial<{ name: string; attendancePercentage: number | null; examAverage: number | null; graduationEligible: boolean; attendanceMet: boolean; examAverageMet: boolean }>) => ({
  name: "Student",
  attendancePercentage: 90,
  examAverage: 80,
  graduationEligible: true,
  attendanceMet: true,
  examAverageMet: true,
  ...overrides,
});

describe("Mentor dashboard + My Mentees + Mentee detail (SMM-43)", () => {
  describe("happy path", () => {
    it("labels risk from the real graduationEligible flag, matching the design source's On track / At risk pills", () => {
      expect(riskLabel(true)).toBe("On track");
      expect(riskLabel(false)).toBe("At risk");
    });

    it("formats percentages and diffs, treating null (no scores yet) as a dash rather than NaN/undefined", () => {
      expect(formatPercent(74.2)).toBe("74.2%");
      expect(formatPercent(null)).toBe("—");
      expect(formatDiff(diff(74.2, 75.5))).toBe("-1.3");
      expect(formatDiff(diff(null, 75.5))).toBe("—");
      expect(formatDiff(0.02)).toBe("0.0");
    });

    it("averages only mentees with a real exam score, excluding those with none (matches the web dashboard)", () => {
      expect(menteesAverage([mentee({ examAverage: 80 }), mentee({ examAverage: 60 }), mentee({ examAverage: null })])).toBe(70);
      expect(menteesAverage([mentee({ examAverage: null })])).toBeNull();
    });

    it("aggregates each mentee's own per-section average into one class-vs-mentees comparison", () => {
      const result = aggregateSectionAverages([
        { sectionAverages: { doctrine: 80, liturgy: 90 } },
        { sectionAverages: { doctrine: 60 } },
      ]);
      expect(result.doctrine).toBe(70);
      expect(result.liturgy).toBe(90);
    });

    it("computes per-section class-vs-mentee diffs, matching the design source's labeled sections", () => {
      const sections = [
        { sectionId: "a", sectionName: "doctrine", displayName: "Doctrine", average: 75 },
        { sectionId: "b", sectionName: "liturgy", displayName: "Liturgy", average: 80 },
      ];
      const result = sectionDiffs(sections, { doctrine: 77.6 });
      expect(result[0].diff).toBeCloseTo(2.6, 5);
      expect(result[1]).toEqual({ sectionId: "b", displayName: "Liturgy", diff: null });
    });

    it("filters, searches, and sorts the mentee list", () => {
      const rows = [
        mentee({ name: "Elaria Matta", graduationEligible: false, attendancePercentage: 92, examAverage: 56 }),
        mentee({ name: "Andrew Shehata", graduationEligible: true, attendancePercentage: 94, examAverage: 81 }),
      ];
      expect(filterMentees(rows, "atRisk").map((r) => r.name)).toEqual(["Elaria Matta"]);
      expect(filterMentees(rows, "onTrack").map((r) => r.name)).toEqual(["Andrew Shehata"]);
      expect(searchMentees(rows, "andrew").map((r) => r.name)).toEqual(["Andrew Shehata"]);
      expect(sortMentees(rows, "name").map((r) => r.name)).toEqual(["Andrew Shehata", "Elaria Matta"]);
      expect(sortMentees(rows, "risk").map((r) => r.name)).toEqual(["Elaria Matta", "Andrew Shehata"]);
    });

    it("counts real graduation-requirement attainment, matching the design source's 'N of M mentees' copy", () => {
      const rows = [mentee({ attendanceMet: true, examAverageMet: true }), mentee({ attendanceMet: true, examAverageMet: false }), mentee({ attendanceMet: false, examAverageMet: false })];
      expect(graduationCounts(rows)).toEqual({ attendance: { met: 2, total: 3 }, exam: { met: 1, total: 3 } });
    });

    it("names the single worst failing section, not just the first one in the list", () => {
      const sections = [
        { section: "a", displayName: "Section A", average: 65, passingMet: true },
        { section: "b", displayName: "Section B", average: 55, passingMet: false },
        { section: "c", displayName: "Section C", average: 40, passingMet: false },
      ];
      expect(worstFailingSection(sections)?.displayName).toBe("Section C");
      expect(worstFailingSection(sections.filter((s) => s.passingMet))).toBeNull();
    });

    it("recognizes the server's exact reassignment-race denial message", () => {
      expect(isReassignmentError("Forbidden: You are not this student's mentor")).toBe(true);
      expect(isReassignmentError("Forbidden")).toBe(false);
      expect(isReassignmentError(undefined)).toBe(false);
    });
  });

  describe("highest-risk path", () => {
    it("gates the whole feature to admins and mentors, and phone access to admins only", () => {
      expect(canViewMentees("MENTOR")).toBe(true);
      expect(canViewMentees("SUPER_ADMIN")).toBe(true);
      expect(canViewMentees("STUDENT")).toBe(false);
      expect(canViewPhone("MENTOR")).toBe(false);
      expect(canViewPhone("SERVANT_PREP")).toBe(true);
      expect(canViewPhone("PRIEST")).toBe(true);
    });
  });
});
