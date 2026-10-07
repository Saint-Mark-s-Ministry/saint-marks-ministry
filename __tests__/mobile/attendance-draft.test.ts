import { describe, expect, it } from "vitest";
import {
  marksForRoster,
  resolveAttendanceNote,
  restPresent,
  rosterProgress,
  sameMarks,
  shiftWeek,
  type AttendanceMarks,
} from "../../apps/mobile/src/data/attendance-draft";

describe("mobile attendance drafts", () => {
  it("starts unmarked, rather than silently marking children present", () => {
    expect(rosterProgress(["a", "b"], {})).toEqual({
      marked: 0,
      present: 0,
      complete: false,
    });
  });

  it("requires a valid status for every child and a nonempty roster", () => {
    expect(rosterProgress([], {}).complete).toBe(false);
    expect(rosterProgress(["a", "b"], { a: "PRESENT" }).complete).toBe(false);
    expect(
      rosterProgress(["a"], { a: "INVALID" } as unknown as AttendanceMarks)
        .complete,
    ).toBe(false);
    expect(
      rosterProgress(["a", "b", "c", "d"], {
        a: "PRESENT",
        b: "LATE",
        c: "ABSENT",
        d: "EXCUSED",
      }),
    ).toEqual({ marked: 4, present: 2, complete: true });
  });

  it("ignores marks from another class when calculating progress", () => {
    expect(rosterProgress(["a"], { b: "PRESENT" })).toEqual({
      marked: 0,
      present: 0,
      complete: false,
    });
  });

  it("takes an independent snapshot containing only the current roster", () => {
    const draft: AttendanceMarks = { a: "PRESENT", b: "ABSENT", other: "LATE" };
    const snapshot = marksForRoster(["a", "b", "unmarked"], draft);
    expect(snapshot).toEqual({ a: "PRESENT", b: "ABSENT" });
    draft.a = "EXCUSED";
    expect(snapshot.a).toBe("PRESENT");
  });

  it("detects unsaved changes only within the selected roster", () => {
    expect(
      sameMarks(["a"], { a: "PRESENT" }, { a: "PRESENT", b: "LATE" }),
    ).toBe(true);
    expect(sameMarks(["a"], { a: "PRESENT" }, { a: "ABSENT" })).toBe(false);
    expect(sameMarks(["a"], { a: "PRESENT" }, {})).toBe(false);
  });

  it("fills only the unmarked roster members, (SMM-50 bulk present, happy path)", () => {
    expect(restPresent(["a", "b", "c"], { a: "ABSENT" })).toEqual({
      a: "ABSENT",
      b: "PRESENT",
      c: "PRESENT",
    });
  });

  it("never overwrites an existing mark, even a full roster (highest-risk path)", () => {
    const fullyMarked: AttendanceMarks = { a: "ABSENT", b: "LATE", c: "EXCUSED" };
    expect(restPresent(["a", "b", "c"], fullyMarked)).toEqual(fullyMarked);
    expect(restPresent([], {})).toEqual({});
  });

  it("prefers a freshly-typed note over the record's existing one (SMM-50, happy path)", () => {
    expect(resolveAttendanceNote("Old note", "New note")).toBe("New note");
    expect(resolveAttendanceNote("Old note", "")).toBe("");
  });

  it("keeps the existing note (or null) when nothing was typed this session (highest-risk path)", () => {
    expect(resolveAttendanceNote("Old note", undefined)).toBe("Old note");
    expect(resolveAttendanceNote(null, undefined)).toBeNull();
    expect(resolveAttendanceNote(undefined, undefined)).toBeNull();
  });

  it.each([
    ["2026-01-03", -1, "2025-12-27"],
    ["2026-12-27", 1, "2027-01-03"],
    ["2026-03-08", -1, "2026-03-01"],
    ["2026-11-01", 1, "2026-11-08"],
    ["2024-02-25", 1, "2024-03-03"],
  ] as const)(
    "shifts %s by %s week without timezone drift",
    (date, direction, expected) => {
      expect(shiftWeek(date, direction)).toBe(expected);
    },
  );
});
