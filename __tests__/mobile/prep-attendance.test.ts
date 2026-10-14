import { describe, expect, it } from "vitest";
import {
  allResolved,
  buildBatchRecords,
  canEditSession,
  canManageAttendance,
  draftChanged,
  isLessonInFuture,
  restPresent,
  searchRoster,
  statusTotals,
  type AttendanceDraft,
} from "../../apps/mobile/src/data/prep-attendance";

describe("Prep attendance workflow (SMM-35)", () => {
  describe("happy path", () => {
    it("tallies status totals and the remaining count", () => {
      const draft: AttendanceDraft = {
        a: { status: "PRESENT" },
        b: { status: "LATE" },
        c: { status: "ABSENT" },
      };
      expect(statusTotals(draft, ["a", "b", "c", "d", "e"])).toEqual({
        present: 1,
        late: 1,
        absent: 1,
        excused: 0,
        marked: 3,
        remaining: 2,
      });
    });

    it("gates Save until every roster student has a status", () => {
      const roster = ["a", "b"];
      expect(allResolved({ a: { status: "PRESENT" } }, roster)).toBe(false);
      expect(allResolved({ a: { status: "PRESENT" }, b: { status: "ABSENT" } }, roster)).toBe(true);
      expect(allResolved({}, [])).toBe(false);
    });

    it("detects a dirty draft against the server-loaded baseline", () => {
      const server: AttendanceDraft = { a: { status: "PRESENT" } };
      expect(draftChanged(server, { a: { status: "PRESENT" } }, ["a"])).toBe(false);
      expect(draftChanged(server, { a: { status: "LATE" } }, ["a"])).toBe(true);
      expect(draftChanged(server, { a: { status: "PRESENT", notes: "note" } }, ["a"])).toBe(true);
    });

    it("Rest present only fills unmarked students, never overwriting an existing mark", () => {
      const draft: AttendanceDraft = { a: { status: "ABSENT" } };
      const next = restPresent(draft, ["a", "b", "c"]);
      expect(next.a.status).toBe("ABSENT");
      expect(next.b.status).toBe("PRESENT");
      expect(next.c.status).toBe("PRESENT");
    });

    it("builds the exact /api/attendance/batch body, dropping unmarked roster members", () => {
      const draft: AttendanceDraft = { a: { status: "PRESENT" }, b: { status: "EXCUSED", notes: "doctor" } };
      expect(buildBatchRecords(draft, ["a", "b", "c"])).toEqual([
        { studentId: "a", status: "PRESENT" },
        { studentId: "b", status: "EXCUSED", notes: "doctor" },
      ]);
    });

    it("a lesson is in the future only when its date is strictly after today", () => {
      expect(isLessonInFuture("2026-10-10", "2026-10-09")).toBe(true);
      expect(isLessonInFuture("2026-10-09", "2026-10-09")).toBe(false);
      expect(isLessonInFuture("2026-10-08", "2026-10-09")).toBe(false);
    });

    it("searches the roster by a case-insensitive substring of name", () => {
      const roster = [{ name: "Andrew Shehata" }, { name: "Anstasia Fam" }];
      expect(searchRoster(roster, "shehata")).toHaveLength(1);
      expect(searchRoster(roster, "")).toHaveLength(2);
    });
  });

  describe("highest-risk path: a session can only be edited by the right role on a non-future date", () => {
    it.each(["SUPER_ADMIN", "SERVANT_PREP"])("lets %s manage attendance", (role) => {
      expect(canManageAttendance(role)).toBe(true);
    });
    it.each(["PRIEST", "MENTOR", "STUDENT", "SERVANT", "PARENT"])(
      "denies %s — PRIEST is read-only even though it's an admin role",
      (role) => {
        expect(canManageAttendance(role)).toBe(false);
      },
    );
    it("denies editing with no role at all", () => {
      expect(canManageAttendance(undefined)).toBe(false);
    });

    it("blocks editing a future lesson even for an admin — matches the server's own rule", () => {
      expect(canEditSession("SUPER_ADMIN", "2026-10-10", "2026-10-09")).toBe(false);
    });
    it("allows editing today's or a past lesson for an admin", () => {
      expect(canEditSession("SUPER_ADMIN", "2026-10-09", "2026-10-09")).toBe(true);
      expect(canEditSession("SERVANT_PREP", "2026-09-01", "2026-10-09")).toBe(true);
    });
    it("blocks a read-only admin (PRIEST) even on a valid date", () => {
      expect(canEditSession("PRIEST", "2026-10-01", "2026-10-09")).toBe(false);
    });
  });
});
