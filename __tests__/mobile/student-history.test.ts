import { describe, expect, it } from "vitest";
import type { StudentHistory } from "@stmark/contracts";
import {
  CALL_OUTCOME_LABEL,
  HISTORY_PROBLEM_MESSAGE,
  HISTORY_TABS,
  attendanceSpoken,
  countRows,
  historyProblem,
  isHistoryFor,
  isStudentHistoryProgram,
  lastVisit,
  parseStudentHistoryParams,
  rateLabel,
  rateTone,
  studentHistoryPath,
  studentHistoryRoute,
  studentHistoryScope,
  visitationDate,
} from "../../apps/mobile/src/data/student-history";

function history(overrides: Partial<StudentHistory> = {}): StudentHistory {
  return {
    id: "child-1",
    name: "Mina Mark",
    program: "sunday-school",
    subtitle: "Sunday School · Grade 3",
    profile: {
      className: "Grade 3", level: "GRADE_3", birthDate: null, gender: null, isActive: true, fatherOfConfession: null,
      phone: null, email: null, guardian: { name: null, phone: null, email: null }, family: null,
    },
    attendance: { kind: "meetings", counts: { present: 3, late: 1, absent: 0, excused: 1 }, rate: 87.5, records: [] },
    notes: { general: null, entries: [] },
    visitations: [],
    phoneCalls: [],
    ...overrides,
  };
}

describe("identifying a student: program and ID, never the name", () => {
  it("builds the request from the ID alone, encoded, with no name in it (highest-risk path)", () => {
    const path = studentHistoryPath({ id: "a/b?c=d", program: "sunday-school" });
    expect(path).toBe("/api/sunday-school/children/a%2Fb%3Fc%3Dd/history");
  });

  it("gives two children with the same name different requests and different cache scopes", () => {
    const viewer = { id: "servant-1" };
    const first = { id: "child-1", name: "Mina Mark", program: "sunday-school" as const };
    const second = { id: "child-2", name: "Mina Mark", program: "sunday-school" as const };
    expect(studentHistoryPath(first)).not.toBe(studentHistoryPath(second));
    expect(studentHistoryScope(viewer, first)).not.toBe(studentHistoryScope(viewer, second));
  });

  it("scopes the cache by viewer, View as session, program and ID", () => {
    const target = { id: "child-1", program: "sunday-school" as const };
    const own = studentHistoryScope({ id: "servant-1" }, target);
    expect(own).toBe(studentHistoryScope({ id: "servant-1" }, target));
    expect(own).not.toBe(studentHistoryScope({ id: "servant-2" }, target));
    expect(own).not.toBe(studentHistoryScope({ id: "servant-1", originalId: "admin-1" }, target));
    expect(own).toContain("child-1");
    expect(own).toContain("sunday-school");
  });

  it("puts only the ID and program in the route; the name is a placeholder", () => {
    const route = studentHistoryRoute({ id: "child-1", name: "Mina Mark", program: "sunday-school" });
    expect(route.pathname).toBe("/student-history/[id]");
    expect(route.params).toEqual({ id: "child-1", program: "sunday-school", name: "Mina Mark" });
  });

  it("reads route params back, taking the first of repeated params", () => {
    expect(parseStudentHistoryParams({ id: "child-1", program: "sunday-school", name: "Mina Mark" })).toEqual({
      id: "child-1", program: "sunday-school", name: "Mina Mark",
    });
    expect(parseStudentHistoryParams({ id: ["child-1", "child-2"], program: ["sunday-school"] })).toMatchObject({ id: "child-1" });
  });

  it("defaults the program and the placeholder name, and refuses what it cannot open", () => {
    expect(parseStudentHistoryParams({ id: "child-1" })).toEqual({ id: "child-1", program: "sunday-school", name: "Student" });
    expect(parseStudentHistoryParams({})).toBeNull();
    expect(parseStudentHistoryParams({ id: "  " })).toBeNull();
    // Servants Prep has no history endpoint, so it is not a program this screen opens.
    expect(parseStudentHistoryParams({ id: "student-1", program: "servants-prep" })).toBeNull();
    expect(isStudentHistoryProgram("servants-prep")).toBe(false);
    expect(isStudentHistoryProgram("sunday-school")).toBe(true);
  });
});

describe("only the record that was asked for is shown", () => {
  const target = { id: "child-1", program: "sunday-school" as const };

  it("accepts a complete answer for the same ID and program", () => {
    expect(isHistoryFor(history(), target)).toBe(true);
  });

  it("rejects an answer for another child, even with the same name (highest-risk path)", () => {
    expect(isHistoryFor(history({ id: "child-2" }), target)).toBe(false);
  });

  it("rejects an answer for another program", () => {
    expect(isHistoryFor({ ...history(), program: "servants-prep" }, target)).toBe(false);
  });

  it("rejects missing or malformed bodies", () => {
    expect(isHistoryFor(null, target)).toBe(false);
    expect(isHistoryFor("<html>maintenance</html>", target)).toBe(false);
    expect(isHistoryFor({ id: "child-1", program: "sunday-school" }, target)).toBe(false);
    expect(isHistoryFor({ ...history(), visitations: undefined }, target)).toBe(false);
  });
});

describe("failures", () => {
  it("tells refused, gone and try-again apart", () => {
    expect(historyProblem(403)).toBe("denied");
    expect(historyProblem(404)).toBe("gone");
    expect(historyProblem(500)).toBe("retry");
    expect(historyProblem(undefined)).toBe("retry");
    expect(HISTORY_PROBLEM_MESSAGE.denied).toMatch(/don't have access/);
    expect(HISTORY_PROBLEM_MESSAGE.gone).toMatch(/no longer available/);
  });
});

describe("display", () => {
  it("offers exactly Attendance, Notes and Visitations", () => {
    expect(HISTORY_TABS.map((tab) => tab.label)).toEqual(["Attendance", "Notes", "Visitations"]);
  });

  it("formats and tones the attendance rate, with a dash when there is none", () => {
    expect(rateLabel(87.5)).toBe("88%");
    expect(rateLabel(null)).toBe("—");
    expect(rateLabel(Number.NaN)).toBe("—");
    expect(rateTone(90)).toBe("success");
    expect(rateTone(60)).toBe("warning");
    expect(rateTone(10)).toBe("danger");
    expect(rateTone(null)).toBe("muted");
  });

  it("lists the four counts and reads them out", () => {
    expect(countRows({ present: 3, late: 1, absent: 0, excused: 1 }).map((row) => row.value)).toEqual([3, 1, 0, 1]);
    expect(attendanceSpoken(history())).toBe("3 present, 1 late, 0 absent, 1 excused. Attendance 88%");
  });

  it("finds the latest completed visit, and dates a visit by when it happened", () => {
    const visits = [
      { id: "v3", status: "NOT_DONE" as const, visitedAt: null, createdAt: "2026-10-12T00:00:00Z", notes: null, recorder: null },
      { id: "v2", status: "DONE" as const, visitedAt: "2026-10-05T00:00:00Z", createdAt: "2026-10-06T00:00:00Z", notes: null, recorder: null },
      { id: "v1", status: "DONE" as const, visitedAt: null, createdAt: "2026-09-01T00:00:00Z", notes: null, recorder: null },
    ];
    expect(lastVisit({ visitations: visits })?.id).toBe("v2");
    expect(lastVisit({ visitations: [visits[0]] })).toBeNull();
    expect(visitationDate(visits[1])).toBe("2026-10-05T00:00:00Z");
    expect(visitationDate(visits[0])).toBe("2026-10-12T00:00:00Z");
  });

  it("labels every call outcome", () => {
    expect(Object.keys(CALL_OUTCOME_LABEL).sort()).toEqual(["CONNECTED", "LEFT_VOICEMAIL", "NO_ANSWER", "OTHER"]);
  });
});
