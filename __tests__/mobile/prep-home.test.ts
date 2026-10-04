import { describe, expect, it } from "vitest";
import {
  PREP_ADMIN_ROLES,
  atRiskTone,
  attendanceProgress,
  examAverageTone,
  isAdminLike,
  nextLessonIndex,
} from "../../apps/mobile/src/data/prep-home";

describe("Prep Home dashboard (SMM-32)", () => {
  describe("happy path", () => {
    it("computes attendance progress from marked/roster counts", () => {
      expect(attendanceProgress(4, 55)).toEqual({ inProgress: true, percent: 7.3 });
      expect(attendanceProgress(55, 55)).toEqual({ inProgress: true, percent: 100 });
      expect(attendanceProgress(0, 55)).toEqual({ inProgress: false, percent: 0 });
    });

    it("never divides by zero when the roster is empty", () => {
      expect(attendanceProgress(0, 0)).toEqual({ inProgress: false, percent: 0 });
    });

    it("colors the program exam average by the 75% target", () => {
      expect(examAverageTone(75.5)).toBe("success");
      expect(examAverageTone(75)).toBe("success");
      expect(examAverageTone(74.9)).toBe("danger");
      expect(examAverageTone(null)).toBe("neutral");
    });

    it("grades an at-risk student's attendance as a hard cutoff at 75%", () => {
      expect(atRiskTone(0, "attendance")).toBe("danger");
      expect(atRiskTone(74, "attendance")).toBe("danger");
      expect(atRiskTone(75, "attendance")).toBe("success");
      expect(atRiskTone(null, "attendance")).toBe("neutral");
    });

    it("grades an at-risk student's exam average on a three-tier scale", () => {
      expect(atRiskTone(46, "exam")).toBe("danger");
      expect(atRiskTone(67, "exam")).toBe("warning");
      expect(atRiskTone(80, "exam")).toBe("success");
    });

    it("finds the next lesson, skipping completed ones and past dates", () => {
      const lessons = [
        { status: "COMPLETED", scheduledDate: "2026-09-25" },
        { status: "COMPLETED", scheduledDate: "2026-10-02" },
        { status: "SCHEDULED", scheduledDate: "2026-10-09" },
        { status: "SCHEDULED", scheduledDate: "2026-10-16" },
      ];
      expect(nextLessonIndex(lessons, "2026-10-03")).toBe(2);
    });

    it("returns -1 when every lesson is completed or in the past", () => {
      const lessons = [
        { status: "COMPLETED", scheduledDate: "2026-09-25" },
        { status: "SCHEDULED", scheduledDate: "2026-09-26" },
      ];
      expect(nextLessonIndex(lessons, "2026-10-03")).toBe(-1);
    });

    it("still surfaces a lesson scheduled for today", () => {
      const lessons = [{ status: "SCHEDULED", scheduledDate: "2026-10-03" }];
      expect(nextLessonIndex(lessons, "2026-10-03")).toBe(0);
    });
  });

  describe("highest-risk path: non-admin roles never see the operational dashboard", () => {
    it.each(PREP_ADMIN_ROLES)("lets %s see it", (role) => {
      expect(isAdminLike(role)).toBe(true);
    });

    it.each(["STUDENT", "MENTOR", "SERVANT", "PARENT"])(
      "hides it from %s — these screens carry other students' names, attendance, and exam scores",
      (role) => {
        expect(isAdminLike(role)).toBe(false);
      },
    );

    it("hides it when there is no signed-in role at all", () => {
      expect(isAdminLike(undefined)).toBe(false);
      expect(isAdminLike(null)).toBe(false);
    });
  });
});
