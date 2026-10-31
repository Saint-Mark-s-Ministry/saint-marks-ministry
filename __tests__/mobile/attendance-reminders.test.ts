import { describe, expect, it, vi } from "vitest";
import {
  ATTENDANCE_REMINDER_KIND,
  attendanceReminderFromMetadata,
  attendanceReminderFromUrl,
  attendanceRemindersScope,
  isMeetingDate,
  onAttendanceReminderRefresh,
  parseReminders,
  reminderDateLabel,
  reminderPath,
  reminderRoute,
  requestAttendanceReminderRefresh,
} from "../../apps/mobile/src/data/attendance-reminders";
import { resolveNotificationRoute, targetFromPushData } from "../../apps/mobile/src/data/notification-routes";

describe("attendance reminders", () => {
  it("opens Take attendance for the returned class on the exact meeting date", () => {
    expect(reminderRoute({ classId: "c1", sessionDate: "2026-10-24" })).toEqual({
      pathname: "/attendance/[classId]",
      params: { classId: "c1", date: "2026-10-24" },
    });
    expect(reminderPath({ classId: "c1", sessionDate: "2026-10-24" })).toBe("/attendance/c1?date=2026-10-24");
  });

  it("an older notification opens its own meeting date, not this week's", () => {
    const old = { kind: ATTENDANCE_REMINDER_KIND, classId: "c1", sessionDate: "2026-09-12", reminderDate: "2026-09-15" };
    expect(attendanceReminderFromMetadata(old)).toEqual({ classId: "c1", sessionDate: "2026-09-12" });
    expect(resolveNotificationRoute({ type: "ANNOUNCEMENT", url: "/dashboard/servants/attendance?classId=c1&date=2026-09-12", metadata: old }))
      .toBe("/attendance/c1?date=2026-09-12");
  });

  it("a push, which has no metadata, opens the same place from the web link it carries", () => {
    const data = { url: "/dashboard/servants/attendance?classId=c1&date=2026-10-24", tag: "ss-attendance-reminder:c1:2026-10-24:2026-10-26:u1", notificationId: "n1" };
    expect(resolveNotificationRoute(targetFromPushData(data))).toBe("/attendance/c1?date=2026-10-24");
    expect(attendanceReminderFromUrl("/dashboard/servants/attendance?classId=c1&date=2026-10-24")).toEqual({ classId: "c1", sessionDate: "2026-10-24" });
  });

  it("refuses links that could escape the route or name a bad date", () => {
    expect(attendanceReminderFromUrl("/dashboard/servants/attendance?classId=../prep-files&date=2026-10-24")).toBeNull();
    expect(attendanceReminderFromUrl("/dashboard/servants/attendance?classId=c1&date=2026-02-30")).toBeNull();
    expect(attendanceReminderFromUrl("/dashboard/servants/attendance?classId=c1")).toBeNull();
    expect(attendanceReminderFromUrl("/dashboard/servants/visitations?classId=c1&date=2026-10-24")).toBeNull();
    expect(attendanceReminderFromMetadata({ kind: ATTENDANCE_REMINDER_KIND, classId: "a/b", sessionDate: "2026-10-24" })).toBeNull();
    expect(attendanceReminderFromMetadata({ kind: "sunday-school-lesson-reminder", classId: "c1", sessionDate: "2026-10-24" })).toBeNull();
    expect(attendanceReminderFromMetadata(null)).toBeNull();
  });

  it("keeps the Tuesday lesson reminder and the attendance reminder apart", () => {
    expect(resolveNotificationRoute({ type: "SUNDAY_SCHOOL_LESSON_REMINDER", url: "/dashboard/servants/lessons/L1", metadata: { kind: "sunday-school-lesson-reminder", lessonId: "L1" } })).toBe("/lesson/L1");
    // A plain attendance page link without a class or date still goes where it always did.
    expect(resolveNotificationRoute({ url: "/dashboard/servants/attendance" })).toBe("/(tabs)/classes");
  });

  it("uses only well-formed reminders from the server's answer", () => {
    const good = { classId: "c1", className: "Grade 2", sessionDate: "2026-10-24", url: "/x" };
    expect(parseReminders({ reminders: [good, { classId: "../x", className: "Bad", sessionDate: "2026-10-24", url: "" }, { classId: "c2", className: "Bad", sessionDate: "tomorrow", url: "" }, null] })).toEqual([good]);
    expect(parseReminders({})).toEqual([]);
    expect(parseReminders(null)).toEqual([]);
  });

  it("writes the church's calendar day as given, whatever the device's zone and across DST changes", () => {
    // US clocks change on 2026-03-08 (spring forward) and 2026-11-01 (fall back); a date-only string must not move.
    for (const [date, label] of [
      ["2026-03-08", "Sun, Mar 8"],
      ["2026-03-07", "Sat, Mar 7"],
      ["2026-11-01", "Sun, Nov 1"],
      ["2026-10-31", "Sat, Oct 31"],
      ["2027-01-03", "Sun, Jan 3"],
    ]) {
      expect(reminderDateLabel(date)).toBe(label);
    }
    expect(isMeetingDate("2026-03-08")).toBe(true);
    expect(isMeetingDate("2026-13-01")).toBe(false);
  });

  it("scopes by viewer, and by the real account during View as", () => {
    expect(attendanceRemindersScope({ id: "u1" })).not.toBe(attendanceRemindersScope({ id: "u2" }));
    expect(attendanceRemindersScope({ id: "u1", originalId: "admin" })).not.toBe(attendanceRemindersScope({ id: "u1" }));
  });

  it("lets a confirmed save ask the banner to ask the server again", () => {
    const listener = vi.fn();
    const off = onAttendanceReminderRefresh(listener);
    requestAttendanceReminderRefresh();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    requestAttendanceReminderRefresh();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
