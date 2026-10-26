import { describe, expect, it } from "vitest";
import {
  ABSENCE_KIND,
  absenceChildFromUrl,
  absenceDisplay,
  absencePath,
  parseAbsenceMetadata,
} from "../../apps/mobile/src/data/absence-notifications";
import { resolveNotificationRoute, targetFromPushData } from "../../apps/mobile/src/data/notification-routes";

const meta = (over: Record<string, unknown> = {}) => ({
  kind: ABSENCE_KIND, childId: "child-1", classId: "class-1", firstAbsenceDate: "2026-10-10", weeks: 3, threshold: 2, ...over,
});

describe("absence notifications", () => {
  it("reads the server's metadata and nothing else", () => {
    expect(parseAbsenceMetadata(meta())).toEqual(meta());
    expect(parseAbsenceMetadata(meta({ kind: "sunday-school-lesson-reminder" }))).toBeNull();
    expect(parseAbsenceMetadata(meta({ childId: "../x" }))).toBeNull();
    expect(parseAbsenceMetadata(meta({ classId: "a/b" }))).toBeNull();
    expect(parseAbsenceMetadata(meta({ firstAbsenceDate: "2026-02-31" }))).toBeNull();
    expect(parseAbsenceMetadata(meta({ weeks: 2.5 }))).toBeNull();
    expect(parseAbsenceMetadata(meta({ threshold: 3 }))).toBeNull();
    expect(parseAbsenceMetadata(null)).toBeNull();
  });

  it("words the three-week follow-up and the four-week escalation", () => {
    expect(absenceDisplay({ weeks: 3, threshold: 2 })).toMatchObject({ tone: "followUp", tag: "Follow-up", weeksText: "3 consecutive weeks absent" });
    expect(absenceDisplay({ weeks: 4, threshold: 4 })).toMatchObject({ tone: "escalation", tag: "Escalation", weeksText: "4 consecutive weeks absent" });
    // Class staff keep getting the follow-up wording as the streak grows; only the escalation tier says Escalation.
    expect(absenceDisplay({ weeks: 6, threshold: 2 }).tag).toBe("Follow-up");
    expect(absenceDisplay({ weeks: 1, threshold: 2 }).weeksText).toBe("1 consecutive week absent");
  });

  it("opens that child's visitation workflow from the feed, using the class when it has one", () => {
    expect(absencePath({ childId: "child-1", classId: "class-1" })).toBe("/visitation/child-1?classId=class-1&check=1");
    expect(absencePath({ childId: "child-1" })).toBe("/visitation/child-1?check=1");
    expect(resolveNotificationRoute({ type: "ANNOUNCEMENT", url: "/dashboard/servants/visitations?childId=child-1", metadata: meta() }))
      .toBe("/visitation/child-1?classId=class-1&check=1");
  });

  it("opens the same child from a push, which carries only the web link", () => {
    const data = { url: "/dashboard/servants/visitations?childId=child-1", tag: "ss-absence:class-1:child-1:2026-10-10:2:u1", notificationId: "n1" };
    expect(resolveNotificationRoute(targetFromPushData(data))).toBe("/visitation/child-1?check=1");
    expect(absenceChildFromUrl("/dashboard/servants/visitations?childId=child-1")).toEqual({ childId: "child-1" });
  });

  it("refuses ids that could leave the route, and links to other pages", () => {
    expect(absenceChildFromUrl("/dashboard/servants/visitations?childId=../prep-files")).toBeNull();
    expect(absenceChildFromUrl("/dashboard/servants/lessons?childId=child-1")).toBeNull();
    expect(absenceChildFromUrl("/dashboard/servants/visitations")).toBeNull();
    // Without a childId the visitations link still opens the list, as before.
    expect(resolveNotificationRoute({ url: "/dashboard/servants/visitations" })).toBe("/visitations");
  });

  it("does not disturb the other Sunday School reminders", () => {
    expect(resolveNotificationRoute({ url: "/dashboard/servants/attendance?classId=c1&date=2026-10-24" })).toBe("/attendance/c1?date=2026-10-24");
    expect(resolveNotificationRoute({ type: "SUNDAY_SCHOOL_LESSON_REMINDER", url: "/dashboard/servants/lessons/L1", metadata: { kind: "sunday-school-lesson-reminder", lessonId: "L1" } })).toBe("/lesson/L1");
  });
});
