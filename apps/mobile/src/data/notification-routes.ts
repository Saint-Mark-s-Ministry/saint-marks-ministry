// Where a notification should take you inside the native app.
//
// The server stores a *web* deep link on every notification
// (`/dashboard/servants/visitations`, `/dashboard/admin/registrations`, …) and
// a `NotificationType`. This maps those to a native route so tapping one opens
// the thing it is about, instead of bouncing out to the browser.
//
// Pure and platform-free so it can be unit tested. Returns `null` when there
// is nothing in the app to open (announcements, rejections that point at `/`).

export interface NotificationTarget {
  url?: string | null;
  type?: string | null;
}

type Builder = (id?: string) => string;

const fixed = (route: string): Builder => () => route;
const withId = (list: string, detail: (id: string) => string): Builder => (id) =>
  id ? detail(id) : list;

// Keyed by `<area>/<page>` under /dashboard. The optional third segment is a
// record id (`registrations/abc`) that a few pages have a native detail for.
export const WEB_TO_NATIVE: Record<string, Builder> = {
  // Servants Prep: student
  student: fixed("/(prep)/home"),
  "student/lessons": withId("/prep-lessons", (id) => `/prep-my-lesson/${id}`),
  "student/application": fixed("/prep-application"),
  "student/exams": withId("/prep-live-exams", (id) => `/prep-live-exam/${id}`),
  "student/makeup-exams": fixed("/prep-exams"),
  "student/class-lessons": fixed("/prep-class-lessons"),
  "student/attendance-slip": fixed("/prep-attendance-slip"),
  "student/sunday-school": fixed("/prep-serving"),
  "student/progress": fixed("/prep-progress"),
  "student/async-notes": fixed("/(prep)/home"),

  // Servants Prep: mentor
  mentor: fixed("/prep-mentor-dashboard"),
  "mentor/my-mentees": withId("/prep-mentees", (id) => `/prep-mentee/${id}`),

  // Servants Prep: administration
  admin: fixed("/(prep)/home"),
  "admin/registrations": withId("/prep-registrations", (id) => `/prep-registration/${id}`),
  "admin/students": withId("/(prep)/students", (id) => `/prep-student/${id}`),
  "admin/mentees": fixed("/(prep)/students"),
  "admin/enrollments": fixed("/(prep)/students"),
  "admin/exams": withId("/prep-exams", (id) => `/prep-exam/${id}`),
  "admin/exam-monitoring": fixed("/prep-exam-monitoring"),
  "admin/attendance": fixed("/prep-attendance"),
  "admin/async-students": withId("/prep-async-students", (id) => `/prep-async-student/${id}`),
  "admin/curriculum": fixed("/prep-curriculum"),
  "admin/activity": fixed("/prep-activity"),
  "admin/servant-applications": fixed("/prep-servant-applications"),
  "admin/users": fixed("/(prep)/ministry"),
  "admin/settings": fixed("/(prep)/ministry"),

  // Sunday School
  servants: fixed("/(tabs)/home"),
  "servants/lessons": withId("/lessons", (id) => `/lesson/${id}`),
  "servants/visitations": withId("/visitations", (id) => `/visitation/${id}`),
  "servants/child-registrations": fixed("/registrations"),
  "servants/servant-applications": fixed("/applications"),
  "servants/classes": withId("/(tabs)/classes", (id) => `/class/${id}`),
  "servants/attendance": withId("/(tabs)/classes", (id) => `/attendance/${id}`),
  "servants/servant-attendance": fixed("/servant-attendance"),
  "servants/roster": fixed("/roster"),
  "servants/children": withId("/roster", (id) => `/child/${id}`),
  "servants/homework": fixed("/homework"),
  "servants/feedback": withId("/feedback", (id) => `/feedback/${id}`),
  "servants/age-groups": fixed("/age-groups"),
  "servants/activity": fixed("/activity"),
  "servants/birthdays": fixed("/sunday-birthdays"),
  "servants/account": fixed("/account"),
  "servants/users": fixed("/people"),

  // Shared
  parent: fixed("/parent-children"),
  "contact-book": fixed("/contact-book"),
  files: fixed("/prep-files"),
  "files/preview": fixed("/prep-files"),
  readings: fixed("/(prep)/home"),
};

// Used when the URL is the site root or something unrecognised: the type still
// says what the notification is about.
export const TYPE_TO_NATIVE: Record<string, string | null> = {
  GRADE_POSTED: "/prep-progress",
  ATTENDANCE_RECORDED: "/prep-progress",
  LESSON_SCHEDULED: "/prep-lessons",
  LESSON_CANCELLED: "/prep-lessons",
  SUNDAY_SCHOOL_LESSON_REMINDER: "/lessons",
  REGISTRATION_RECEIVED: "/prep-registrations",
  REGISTRATION_APPROVED: "/(prep)/home",
  REGISTRATION_REJECTED: null,
  REGISTRATION_INCOMPLETE: null,
  ASYNC_NOTE_REVIEWED: "/(prep)/home",
  MENTOR_ASSIGNED: "/prep-mentees",
  ANNOUNCEMENT: null,
  CONDUCT_REMOVAL: null,
  SERVANT_APPLICATION_RECEIVED: "/applications",
  SERVANT_APPLICATION_REVIEWED: "/(tabs)/home",
  CHILD_REGISTRATION_RECEIVED: "/registrations",
  CHILD_REGISTRATION_REVIEWED: "/parent-children",
  PRIEST_NOTE_CREATED: "/visitations",
};

function pathSegments(url: string): string[] {
  let pathname = url;
  try {
    // Absolute or relative; the base only matters for relative inputs.
    pathname = new URL(url, "https://portal.invalid").pathname;
  } catch {
    // Fall through with the raw string.
  }
  return pathname.split("/").filter(Boolean);
}

/** The native route for a notification, or `null` if there is nothing to open. */
export function resolveNotificationRoute(target: NotificationTarget): string | null {
  const url = target.url?.trim();
  if (url) {
    const segments = pathSegments(url);
    if (segments[0] === "dashboard" && segments.length > 1) {
      const [, area, page, id] = segments;
      if (area === "admin" && page === "exams" && id && segments[4] === "monitor") return `/prep-exam-monitor/${id}`;
      // `/dashboard/student` has no page; `/dashboard/servants/x/ID` has an id.
      const keyWithPage = page ? `${area}/${page}` : area;
      const withPage = WEB_TO_NATIVE[keyWithPage];
      if (withPage) return withPage(id);
      // `/dashboard/admin/<unknown>` still belongs somewhere in the same area.
      const areaOnly = WEB_TO_NATIVE[area];
      if (areaOnly) return areaOnly();
    }
  }
  const byType = target.type ? TYPE_TO_NATIVE[target.type] : undefined;
  return byType ?? null;
}

/** Whether the destination is a tab root rather than a pushed screen. */
export function isTabRoot(route: string): boolean {
  return /^\/\((tabs|prep)\)\//.test(route);
}
