import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TYPE_TO_NATIVE,
  WEB_TO_NATIVE,
  isTabRoot,
  resolveNotificationRoute,
} from "../../apps/mobile/src/data/notification-routes";

const APP = join(__dirname, "../../apps/mobile/src/app");

/** `/prep-mentee/abc` -> `prep-mentee/[id].tsx`; `/(tabs)/classes` -> `(tabs)/classes/index.tsx`. */
function routeFileExists(route: string): boolean {
  const parts = route.split("/").filter(Boolean);
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
});
