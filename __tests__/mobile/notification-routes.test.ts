import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LESSON_REMINDER_KIND,
  TYPE_TO_NATIVE,
  WEB_TO_NATIVE,
  isTabRoot,
  lessonReminderLessonId,
  resolveNotificationRoute,
  targetFromPushData,
} from "../../apps/mobile/src/data/notification-routes";

const APP = join(__dirname, "../../apps/mobile/src/app");

/** `/prep-mentee/abc` -> `prep-mentee/[id].tsx`; `/(tabs)/classes` -> `(tabs)/classes/index.tsx`. */
function routeFileExists(route: string): boolean {
  // A query string (`/feedback?idea=…`) selects what the screen shows, not which file it is.
  const parts = route.split("?")[0].split("/").filter(Boolean);
  const direct = join(APP, ...parts) + ".tsx";
  const asIndex = join(APP, ...parts, "index.tsx");
  const dynamic = join(APP, ...parts.slice(0, -1), "[id].tsx");
  const dynamicClass = join(APP, ...parts.slice(0, -1), "[classId].tsx");
  const dynamicChild = join(APP, ...parts.slice(0, -1), "[childId].tsx");
  return [direct, asIndex, dynamic, dynamicClass, dynamicChild].some(existsSync);
}

describe("notification -> native route", () => {
  it("opens the screen a web deep link points at (happy path)", () => {
    expect(resolveNotificationRoute({ url: "/dashboard/servants/visitations" })).toBe("/visitations");
    expect(resolveNotificationRoute({ url: "/dashboard/admin/registrations" })).toBe("/prep-registrations");
    expect(resolveNotificationRoute({ url: "/dashboard/servants/child-registrations" })).toBe("/registrations");
    expect(resolveNotificationRoute({ url: "/dashboard/student/application" })).toBe("/prep-application");
    expect(resolveNotificationRoute({ url: "/dashboard/mentor/my-mentees" })).toBe("/prep-mentees");
  });

  it("opens the specific record when the link carries an id", () => {
    expect(resolveNotificationRoute({ url: "/dashboard/admin/exams/exam1/monitor" })).toBe("/prep-exam-monitor/exam1");
    expect(resolveNotificationRoute({ url: "/dashboard/admin/exam-monitoring" })).toBe("/prep-exam-monitoring");
    expect(resolveNotificationRoute({ url: "/dashboard/student/exams" })).toBe("/prep-live-exams");
    expect(resolveNotificationRoute({ url: "/dashboard/student/exams/exam1" })).toBe("/prep-live-exam/exam1");
    expect(resolveNotificationRoute({ url: "/dashboard/admin/registrations/r42" })).toBe("/prep-registration/r42");
    expect(resolveNotificationRoute({ url: "/dashboard/servants/lessons/l7" })).toBe("/lesson/l7");
    expect(resolveNotificationRoute({ url: "/dashboard/servants/classes/c1" })).toBe("/class/c1");
  });

  it("accepts an absolute URL and ignores query strings", () => {
    expect(
      resolveNotificationRoute({ url: "https://servants-prep-app.vercel.app/dashboard/servants/lessons?classId=c1" }),
    ).toBe("/lessons");
  });

  it("falls back to the notification type when the link is just the site root (highest-risk path)", () => {
    expect(resolveNotificationRoute({ url: "/", type: "SUNDAY_SCHOOL_LESSON_REMINDER" })).toBe("/lessons");
    expect(resolveNotificationRoute({ url: null, type: "PRIEST_NOTE_CREATED" })).toBe("/visitations");
  });

  it("never invents a destination for notifications that have none", () => {
    expect(resolveNotificationRoute({ url: "/", type: "ANNOUNCEMENT" })).toBeNull();
    expect(resolveNotificationRoute({ url: "/", type: "REGISTRATION_REJECTED" })).toBeNull();
    expect(resolveNotificationRoute({ url: "https://example.com/elsewhere", type: "CONDUCT_REMOVAL" })).toBeNull();
    expect(resolveNotificationRoute({})).toBeNull();
  });

  it("keeps an unknown page inside its own area rather than dropping the user", () => {
    expect(resolveNotificationRoute({ url: "/dashboard/admin/something-new" })).toBe("/(prep)/home");
    expect(resolveNotificationRoute({ url: "/dashboard/servants/something-new" })).toBe("/(tabs)/home");
  });

  it("tells tab roots from pushed screens", () => {
    expect(isTabRoot("/(tabs)/classes")).toBe(true);
    expect(isTabRoot("/(prep)/home")).toBe(true);
    expect(isTabRoot("/visitations")).toBe(false);
  });

  it("opens the shared feedback board from either ministry's link, on the post when one is named", () => {
    expect(resolveNotificationRoute({ url: "/dashboard/servants/feedback" })).toBe("/feedback");
    expect(resolveNotificationRoute({ url: "/dashboard/admin/feedback" })).toBe("/feedback");
    expect(resolveNotificationRoute({ url: "/dashboard/admin/feedback/cm9idea" })).toBe("/feedback?idea=cm9idea");
    expect(resolveNotificationRoute({ url: "/dashboard/servants/feedback/cm9idea" })).toBe("/feedback?idea=cm9idea");
  });

  it("only ever points at screens that exist in the app", () => {
    const routes = new Set<string>();
    for (const build of Object.values(WEB_TO_NATIVE)) {
      routes.add(build());
      routes.add(build("sample-id"));
    }
    for (const route of Object.values(TYPE_TO_NATIVE)) if (route) routes.add(route);
    const missing = [...routes].filter((route) => !routeFileExists(route));
    expect(missing).toEqual([]);
  });

  describe("Tuesday teaching reminders", () => {
    const metadata = { kind: LESSON_REMINDER_KIND, lessonId: "cm9lesson1", lessonDate: "Sat, Oct 17, 2026" };

    it("opens the exact lesson from the feed row (happy path)", () => {
      expect(
        resolveNotificationRoute({ url: "/dashboard/servants/lessons", type: "ANNOUNCEMENT", metadata }),
      ).toBe("/lesson/cm9lesson1");
    });

    it("opens the exact lesson from a tapped push, which has no notification type", () => {
      const target = targetFromPushData({
        url: "/dashboard/servants/lessons",
        tag: "ss-lesson-reminder:cm9lesson1:teacher",
        notificationId: "ss-lesson-reminder:cm9lesson1:teacher",
        kind: LESSON_REMINDER_KIND,
        lessonId: "cm9lesson1",
      });
      expect(resolveNotificationRoute(target)).toBe("/lesson/cm9lesson1");
    });

    it("falls back to the lessons list when the lesson id is missing or unusable (highest-risk path)", () => {
      for (const bad of [
        { kind: LESSON_REMINDER_KIND },
        { kind: LESSON_REMINDER_KIND, lessonId: "" },
        { kind: LESSON_REMINDER_KIND, lessonId: 42 },
        { kind: LESSON_REMINDER_KIND, lessonId: "../prep-files" },
        { kind: LESSON_REMINDER_KIND, lessonId: "a/b" },
        { kind: LESSON_REMINDER_KIND, lessonId: "x".repeat(65) },
      ]) {
        expect(lessonReminderLessonId(bad)).toBeNull();
        expect(resolveNotificationRoute({ url: "/dashboard/servants/lessons", metadata: bad })).toBe("/lessons");
      }
    });

    it("ignores other kinds and non-object metadata", () => {
      expect(lessonReminderLessonId({ kind: "something-else", lessonId: "cm9lesson1" })).toBeNull();
      expect(lessonReminderLessonId(null)).toBeNull();
      expect(lessonReminderLessonId("sunday-school-lesson-reminder")).toBeNull();
      expect(resolveNotificationRoute({ url: "/dashboard/servants/lessons", metadata: { kind: "other", lessonId: "x" } })).toBe("/lessons");
    });

    it("reads a push payload defensively", () => {
      expect(targetFromPushData(undefined)).toEqual({ url: null, type: null, metadata: {} });
      expect(targetFromPushData({ url: 5, tag: "REGISTRATION_RECEIVED" })).toMatchObject({ url: null, type: "REGISTRATION_RECEIVED" });
      expect(targetFromPushData({ type: "GRADE_POSTED", tag: "ignored" }).type).toBe("GRADE_POSTED");
    });
  });
});
