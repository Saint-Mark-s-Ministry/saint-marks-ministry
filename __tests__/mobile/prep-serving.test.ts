import { describe, expect, it } from "vitest";
import {
  canViewOwnServing,
  currentWeekOf,
  gradeLabel,
  logPill,
  normalizeCode,
  stintSegments,
  submitBlocker,
  submitErrorMessage,
  validateCode,
  weekNumberFor,
  weeksDone,
  type Assignment,
  type ServingLog,
} from "../../apps/mobile/src/data/prep-serving";

const now = new Date(2026, 9, 6, 12, 0); // Oct 6, 2026 (local), a Tuesday
const WEEK = 7 * 24 * 60 * 60 * 1000;
const weeksFromCurrent = (n: number) => new Date(currentWeekOf(now).getTime() + n * WEEK).toISOString();

// Stint started two weeks ago, so the current week is week 3 of 6.
const assignment = (over: Partial<Assignment> = {}): Assignment => ({
  id: "a1",
  grade: "GRADE_2",
  yearLevel: "YEAR_1",
  totalWeeks: 6,
  startDate: weeksFromCurrent(-2),
  isActive: true,
  academicYear: { name: "2026–27" },
  ...over,
});
const log = (weekNumber: number, status: ServingLog["status"]): ServingLog => ({
  id: `log-${weekNumber}`,
  assignmentId: "a1",
  weekNumber,
  weekOf: weeksFromCurrent(weekNumber - 3),
  status,
});

describe("week math", () => {
  it("starts the week on local Sunday midnight, as the web page does", () => {
    const start = currentWeekOf(now);
    expect(start.getDay()).toBe(0);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });

  it("numbers weeks from the stint start and is null before it", () => {
    expect(weekNumberFor(weeksFromCurrent(-2), currentWeekOf(now))).toBe(3);
    expect(weekNumberFor(weeksFromCurrent(1), currentWeekOf(now))).toBeNull();
  });
});

describe("stint progress", () => {
  it("marks each week done, rejected, current, missed, or upcoming", () => {
    const segments = stintSegments(assignment(), [log(1, "VERIFIED"), log(2, "REJECTED")], now);
    expect(segments.map((s) => s.state)).toEqual(["done", "rejected", "current", "upcoming", "upcoming", "upcoming"]);
    expect(weeksDone(segments)).toBe(1);
  });

  it("marks a week with no log as missed once it has passed", () => {
    const segments = stintSegments(assignment(), [], now);
    expect(segments[0].state).toBe("missed");
    expect(segments[1].state).toBe("missed");
  });
});

describe("code entry", () => {
  it("normalizes case and surrounding spaces", () => {
    expect(normalizeCode("  g2-a7x3 ")).toBe("G2-A7X3");
  });

  it("says what's wrong before anything is sent", () => {
    expect(validateCode("   ")).toBe("Enter the code your servant gave you.");
    expect(validateCode("ab")).toBe("That code is too short. Check it with your servant.");
    expect(validateCode("G2 A7X3")).toBe("Codes use letters, numbers and dashes only.");
    expect(validateCode("g2-a7x3")).toBeNull();
  });
});

describe("whether this week can be logged", () => {
  it("is not eligible without an active stint, and says what to do", () => {
    const blocker = submitBlocker(null, [], now);
    expect(blocker).toMatchObject({ kind: "not-eligible" });
    expect(blocker.kind === "not-eligible" && blocker.message).toMatch(/Ask your servant/);
  });

  it("is outside the period before the stint starts and after it ends", () => {
    expect(submitBlocker(assignment({ startDate: weeksFromCurrent(1) }), [], now)).toMatchObject({ kind: "outside-period" });
    expect(submitBlocker(assignment({ totalWeeks: 2 }), [], now)).toMatchObject({ kind: "outside-period" });
  });

  it("refuses a week that's already logged, but allows a rejected one to be sent again", () => {
    expect(submitBlocker(assignment(), [log(3, "VERIFIED")], now)).toMatchObject({ kind: "already-logged" });
    expect(submitBlocker(assignment(), [log(3, "REJECTED")], now)).toEqual({ kind: "ready" });
  });
});

describe("server refusals", () => {
  it("tells the student the next step for expired, grade, and week mismatches", () => {
    expect(submitErrorMessage(410, "This code has expired")).toMatch(/Ask your servant for this week's code/);
    expect(submitErrorMessage(422, "This code is for a different grade than your assignment")).toMatch(/your grade's code/);
    expect(submitErrorMessage(422, "This code is for a different week than the one you submitted")).toMatch(/this week's code/);
  });

  it("explains a lost connection without losing the code", () => {
    expect(submitErrorMessage(null)).toMatch(/Your code is still here/);
  });

  it("never echoes the server's own wording", () => {
    expect(submitErrorMessage(404, "Invalid attendance code")).not.toMatch(/Invalid attendance code/);
  });
});

describe("history labels and permission", () => {
  it("reads the grade the way the web page does", () => {
    expect(gradeLabel("GRADE_2")).toBe("Grade 2");
    expect(gradeLabel("PRE_K")).toBe("Pre-K");
    expect(gradeLabel("GRADE_6_PLUS")).toBe("6th Grade+");
  });


  it("names each logged week in words", () => {
    expect(logPill("VERIFIED")).toEqual({ label: "Present", tone: "success" });
    expect(logPill("EXCUSED").label).toBe("Excused");
    expect(logPill("REJECTED").label).toBe("Not accepted");
  });

  it("only a STUDENT uses this screen", () => {
    expect(canViewOwnServing("STUDENT")).toBe(true);
    for (const role of ["MENTOR", "SERVANT", "SERVANT_PREP", "SUPER_ADMIN", null, undefined]) {
      expect(canViewOwnServing(role)).toBe(false);
    }
  });
});
