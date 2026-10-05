import { describe, expect, it } from "vitest";
import {
  daysLeft,
  getConfessionPeriodStatus,
  groupByFather,
  periodClosed,
  segmentCounts,
  segmentFor,
  type ConfessionPeriod,
} from "../../apps/mobile/src/data/confession";
import { canManageAttendance } from "../../apps/mobile/src/data/prep-attendance";
import { isAdminLike } from "../../apps/mobile/src/data/prep-home";

describe("Confession periods + slip upload (SMM-36)", () => {
  describe("happy path", () => {
    it("collapses the 6 period statuses into the 3 segments the filter shows", () => {
      expect(segmentFor("slip")).toBe("received");
      expect(segmentFor("registration")).toBe("received");
      expect(segmentFor("missing")).toBe("missing");
      expect(segmentFor("due")).toBe("due");
      expect(segmentFor("upcoming")).toBe("due");
      expect(segmentFor("na")).toBeNull();
    });

    it("counts each segment, excluding na entirely", () => {
      expect(segmentCounts(["slip", "registration", "due", "due", "missing", "na"])).toEqual({
        due: 2,
        received: 2,
        missing: 1,
      });
    });

    it("groups rows by father of confession, sorted by name, unassigned last", () => {
      const rows = [
        { fatherName: "Rev. Fr. Gabriel Yacoub", status: "due" as const },
        { fatherName: null, status: "due" as const },
        { fatherName: "Very Rev. Fr. Markos Ayoub", status: "due" as const },
      ];
      const groups = groupByFather(rows);
      expect(groups.map((g) => g.father)).toEqual([
        "Rev. Fr. Gabriel Yacoub",
        "Very Rev. Fr. Markos Ayoub",
        "No father of confession assigned",
      ]);
    });

    it("counts down the days left in a period, floored at 0", () => {
      const period: ConfessionPeriod = { start: new Date(Date.UTC(2026, 8, 1)), end: new Date(Date.UTC(2026, 9, 31)) };
      expect(daysLeft(period, new Date(Date.UTC(2026, 9, 30)))).toBe(1);
      expect(daysLeft(period, new Date(Date.UTC(2026, 10, 5)))).toBe(0);
    });

    it("knows when a period has closed", () => {
      const period: ConfessionPeriod = { start: new Date(Date.UTC(2026, 8, 1)), end: new Date(Date.UTC(2026, 9, 31)) };
      expect(periodClosed(period, new Date(Date.UTC(2026, 9, 30)))).toBe(false);
      expect(periodClosed(period, new Date(Date.UTC(2026, 10, 1)))).toBe(true);
    });
  });

  describe("highest-risk path", () => {
    it("never assigns a segment to a not-yet-joined student (na) — they must not appear as due or missing", () => {
      const period: ConfessionPeriod = { start: new Date(Date.UTC(2026, 8, 1)), end: new Date(Date.UTC(2026, 9, 31)) };
      const joinedLate = new Date(Date.UTC(2026, 10, 15)); // joins after this period ends
      const status = getConfessionPeriodStatus(period, joinedLate, false, new Date(Date.UTC(2026, 9, 15)));
      expect(status).toBe("na");
      expect(segmentFor(status)).toBeNull();
    });

    it.each(["SUPER_ADMIN", "SERVANT_PREP"])("lets %s upload a slip", (role) => {
      expect(canManageAttendance(role)).toBe(true);
    });
    it.each(["PRIEST", "MENTOR", "STUDENT", "SERVANT", "PARENT"])(
      "denies %s upload access — PRIEST can view the tracker but not write",
      (role) => {
        expect(canManageAttendance(role)).toBe(false);
      },
    );
    it("PRIEST can still view the tracker (isAdminLike), unlike the write-gated roles above", () => {
      expect(isAdminLike("PRIEST")).toBe(true);
      expect(canManageAttendance("PRIEST")).toBe(false);
    });
    it("hides the tracker entirely from non-admin, non-upload roles", () => {
      expect(isAdminLike("MENTOR")).toBe(false);
      expect(isAdminLike(undefined)).toBe(false);
    });
  });
});
