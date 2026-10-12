import { describe, expect, it } from "vitest";
import type { SundaySchoolClassSummary } from "@stmark/contracts";
import {
  attendanceTone,
  groupClassesByAgeGroup,
  levelMoveImpact,
  levelRangeLabel,
  sessionAttendanceSubtitle,
  shortMonthDay,
} from "../../apps/mobile/src/data/sunday-school-classes";

function cls(overrides: Partial<SundaySchoolClassSummary> = {}): SundaySchoolClassSummary {
  return {
    id: "c1", name: "Class", level: "GRADE_3", ageGroup: null, childCount: 0, sessionCount: 0,
    attendancePercentage: 0, latestSession: null, attendanceTakenThisWeek: false,
    canServe: false, canCoordinate: false, servants: [],
    ...overrides,
  };
}

describe("levelRangeLabel", () => {
  it("collapses a contiguous numeric-grade range (happy path)", () => {
    expect(levelRangeLabel(["GRADE_1", "GRADE_2", "GRADE_3"])).toBe("Grades 1–3");
  });

  it("abbreviates Kindergarten to K in a mixed Pre-K/K range", () => {
    expect(levelRangeLabel(["PRE_K", "KINDERGARTEN"])).toBe("Pre-K – K");
  });

  it("falls back to full names, comma-joined, for a non-contiguous selection (highest-risk path)", () => {
    expect(levelRangeLabel(["GRADE_1", "GRADE_5"])).toBe("1st Grade, 5th Grade");
  });

  it("returns the single level's own name, not a degenerate range, for one grade", () => {
    expect(levelRangeLabel(["GRADE_3"])).toBe("3rd Grade");
  });

  it("is order-independent (sorts by this app's own grade order, not input order)", () => {
    expect(levelRangeLabel(["GRADE_3", "GRADE_1", "GRADE_2"])).toBe("Grades 1–3");
  });

  it("never throws on an empty selection", () => {
    expect(levelRangeLabel([])).toBe("No grades");
  });
});

describe("groupClassesByAgeGroup", () => {
  // The dashboard's own ageGroups array arrives pre-sorted by sortOrder (a
  // field this narrower shape doesn't carry) — this fixture's array order
  // ("Little Ones" before "Primary") stands in for that pre-sorting.
  const ageGroups = [{ id: "a2", name: "Little Ones" }, { id: "a1", name: "Primary" }];

  it("groups by age group, preserving the age groups' own pre-sorted order (happy path)", () => {
    const classes = [
      cls({ id: "1", name: "Grade 2", ageGroup: { id: "a1", name: "Primary" } }),
      cls({ id: "2", name: "Pre-K", ageGroup: { id: "a2", name: "Little Ones" } }),
    ];
    const groups = groupClassesByAgeGroup(classes, ageGroups);
    expect(groups.map((g) => g.name)).toEqual(["Little Ones", "Primary"]);
  });

  it("collects classes with no age group under 'Other classes' instead of dropping them (highest-risk path)", () => {
    const classes = [cls({ id: "1", ageGroup: null })];
    const groups = groupClassesByAgeGroup(classes, ageGroups);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ name: "Other classes", classes: [classes[0]] });
  });
});

describe("attendanceTone", () => {
  it("matches the same thresholds used on Child detail", () => {
    expect(attendanceTone(90)).toBe("success");
    expect(attendanceTone(75)).toBe("success");
    expect(attendanceTone(60)).toBe("warning");
    expect(attendanceTone(50)).toBe("warning");
    expect(attendanceTone(10)).toBe("danger");
  });
});

describe("shortMonthDay", () => {
  it("reads the stored UTC calendar date (happy path)", () => {
    expect(shortMonthDay("2026-09-27T00:00:00.000Z")).toBe("Sep 27");
  });

  it("doesn't shift to the previous day for a late-UTC timestamp (highest-risk path)", () => {
    expect(shortMonthDay("2026-01-01")).toBe("Jan 1");
  });
});

describe("sessionAttendanceSubtitle", () => {
  it("counts only PRESENT marks against the current roster size (happy path)", () => {
    const session = { attendance: [{ status: "PRESENT" }, { status: "PRESENT" }, { status: "LATE" }, { status: "ABSENT" }] };
    expect(sessionAttendanceSubtitle(session, 13)).toBe("2 of 13 present");
  });

  it("appends the topic only when one exists (highest-risk path)", () => {
    expect(sessionAttendanceSubtitle({ attendance: [], topic: "The Prodigal Son" }, 10)).toBe("0 of 10 present · The Prodigal Son");
    expect(sessionAttendanceSubtitle({ attendance: [], topic: null }, 10)).toBe("0 of 10 present");
  });
});

describe("levelMoveImpact", () => {
  const ageGroups = [
    { id: "a1", name: "Primary", levels: ["GRADE_1", "GRADE_2", "GRADE_3"] as const },
    { id: "a2", name: "Middle", levels: ["GRADE_4", "GRADE_5"] as const },
  ];

  it("reports no band change within the same band (happy path)", () => {
    expect(levelMoveImpact("GRADE_1", "GRADE_2", ageGroups as never)).toEqual({ movesBand: false, destinationBandName: null });
  });

  it("names the destination band when the move crosses bands (highest-risk path)", () => {
    expect(levelMoveImpact("GRADE_3", "GRADE_4", ageGroups as never)).toEqual({ movesBand: true, destinationBandName: "Middle" });
  });

  it("reports no move at all for an unchanged level", () => {
    expect(levelMoveImpact("GRADE_3", "GRADE_3", ageGroups as never)).toEqual({ movesBand: false, destinationBandName: null });
  });

  it("treats an unbanded destination level honestly, not as a crash", () => {
    expect(levelMoveImpact("GRADE_1", "GRADE_9", ageGroups as never)).toEqual({ movesBand: true, destinationBandName: null });
  });
});
