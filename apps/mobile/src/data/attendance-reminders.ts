// Class-attendance reminders (GET /api/sunday-school/attendance/reminders), kept
// apart from the Tuesday lesson-teaching reminders. The server decides who is
// reminded and when a class is done: only personally assigned class teams, only
// classes with active children, and a class counts as done only when every active
// child has a saved mark for the exact meeting date. The app never works that
// out for itself: a session, a partial save, servant attendance or a local draft
// do not clear a reminder; only the server's answer does. Pure helpers.

import type {
  SundaySchoolAttendanceReminder,
  SundaySchoolAttendanceRemindersResponse,
} from "@stmark/contracts";

export type { SundaySchoolAttendanceReminder, SundaySchoolAttendanceRemindersResponse };

export const ATTENDANCE_REMINDERS_PATH = "/api/sunday-school/attendance/reminders";

/** `metadata.kind` on the notification the server writes for a class-attendance reminder (lib/notifications.ts). */
export const ATTENDANCE_REMINDER_KIND = "sunday-school-attendance-reminder";

/** Cache scope: the signed-in viewer (and View as original), so one account's reminders never show for another. */
export function attendanceRemindersScope(viewer: { id: string; originalId?: string | null }): string {
  return ["attendance-reminders", viewer.originalId ? `${viewer.originalId}>${viewer.id}` : viewer.id].join(":");
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** A real calendar day `YYYY-MM-DD`; it is used in a route, so nothing else gets through. */
export function isMeetingDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isReminder(value: unknown): value is SundaySchoolAttendanceReminder {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.classId === "string" && ID.test(item.classId) &&
    typeof item.className === "string" &&
    isMeetingDate(item.sessionDate)
  );
}

/** The usable reminders from an answer; anything malformed is dropped rather than shown or followed. */
export function parseReminders(data: unknown): SundaySchoolAttendanceReminder[] {
  const list = (data as Partial<SundaySchoolAttendanceRemindersResponse> | null | undefined)?.reminders;
  return Array.isArray(list) ? list.filter(isReminder) : [];
}

/** Opens Take attendance for the returned class on the exact meeting date. */
export function reminderRoute(target: { classId: string; sessionDate: string }) {
  return { pathname: "/attendance/[classId]", params: { classId: target.classId, date: target.sessionDate } } as const;
}

/** The same destination as a path string, for notification routing. */
export function reminderPath(target: { classId: string; sessionDate: string }): string {
  return `/attendance/${target.classId}?date=${target.sessionDate}`;
}

/**
 * The class and exact meeting date a reminder notification is about, from its
 * `metadata` (the in-app feed). Older notifications carry their own `sessionDate`,
 * so they open the original meeting, not this week's.
 */
export function attendanceReminderFromMetadata(metadata: unknown): { classId: string; sessionDate: string } | null {
  if (!metadata || typeof metadata !== "object") return null;
  const { kind, classId, sessionDate } = metadata as Record<string, unknown>;
  if (kind !== ATTENDANCE_REMINDER_KIND) return null;
  return typeof classId === "string" && ID.test(classId) && isMeetingDate(sessionDate) ? { classId, sessionDate } : null;
}

/**
 * The same, from the web link a push carries (`/dashboard/servants/attendance?classId=…&date=…`).
 * A push payload has no metadata, only this link.
 */
export function attendanceReminderFromUrl(url: string | null | undefined): { classId: string; sessionDate: string } | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url, "https://portal.invalid");
  } catch {
    return null;
  }
  if (!/^\/dashboard\/servants\/attendance\/?$/.test(parsed.pathname)) return null;
  const classId = parsed.searchParams.get("classId");
  const sessionDate = parsed.searchParams.get("date");
  return classId && ID.test(classId) && isMeetingDate(sessionDate) ? { classId, sessionDate } : null;
}

/** "Sat, Oct 24": the church's calendar day as written, never shifted by the device's time zone or a DST change. */
export function reminderDateLabel(sessionDate: string): string {
  return new Date(`${sessionDate}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function reminderSpoken(reminder: Pick<SundaySchoolAttendanceReminder, "className" | "sessionDate">): string {
  return `${reminder.className}, ${reminderDateLabel(reminder.sessionDate)}. Take attendance`;
}

export const REMINDER_TITLE = "Take attendance for your class";
export const REMINDER_NOTE = "This reminder clears once every child's attendance is saved.";
export const REMINDER_CHECK_FAILED = "Couldn't check attendance reminders.";

// ── Refreshing after a save ─────────────────────────────────────────────────

const refreshers = new Set<() => void>();

/** The reminder banner registers here so a confirmed attendance save can ask it to ask the server again. */
export function onAttendanceReminderRefresh(listener: () => void): () => void {
  refreshers.add(listener);
  return () => {
    refreshers.delete(listener);
  };
}

/** Call after a confirmed attendance save: the server decides whether the class is now complete. */
export function requestAttendanceReminderRefresh(): void {
  refreshers.forEach((listener) => listener());
}
