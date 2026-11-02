// Servant Attendance → Servants meetings (SMM-112), the native counterpart of the web's
// components/sunday-school-servants-meetings.tsx. Pure rules, so every one of them is testable without
// a screen. The server decides who may see, create and save (app/api/sunday-school/servants-meetings);
// nothing here grants anything. These only decide what the app shows and refuses to send.

import type {
  SundaySchoolDashboard,
  SundaySchoolMeetingMark,
  SundaySchoolServantsMeetingAttendee,
  SundaySchoolServantsMeetingCreateRequest,
  SundaySchoolServantsMeetingSaveRequest,
  SundaySchoolServantsMeetingSummary,
} from "@stmark/contracts";

export const SERVANTS_MEETINGS_PATH = "/api/sunday-school/servants-meetings";
export const MAX_MEETING_TITLE = 200;

export type MeetingMarks = Record<string, SundaySchoolMeetingMark>;

/**
 * The bands to offer: the dashboard's server-scoped list, narrowed as the web does (lib/sunday-school-meeting-groups).
 * Whatever the API authorizes is shown; a band the account may not open answers 403 and is never listed.
 */
export function servantsMeetingGroups(dashboard?: SundaySchoolDashboard) {
  if (!dashboard) return [];
  return (dashboard.ageGroups ?? []).filter(
    (group) =>
      dashboard.standing.isAdmin ||
      dashboard.standing.readOnly ||
      group.canCoordinate ||
      (dashboard.classes ?? []).some((cls) => cls.ageGroup?.id === group.id),
  );
}

/** The calendar day of a meeting's ISO timestamp. */
export const meetingDay = (meeting: Pick<SundaySchoolServantsMeetingSummary, "date">) => meeting.date.slice(0, 10);

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function validDay(value: string): boolean {
  return DAY.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

/** "Sat, Oct 3, 2026", read in UTC so a phone in another time zone never moves the day. */
export function meetingDateLabel(day: string): string {
  if (!validDay(day)) return day;
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function meetingTitleLabel(meeting: Pick<SundaySchoolServantsMeetingSummary, "date" | "title">): string {
  return `${meetingDateLabel(meetingDay(meeting))}${meeting.title ? ` — ${meeting.title}` : ""}`;
}

export type AttendanceGate = "editable" | "not-yet" | "view-only";

/**
 * Whether marks can be changed. Only someone who may manage the roster can, and only on or after the meeting's
 * own day: a future meeting can be planned but its attendance opens on its date. Past attendance stays correctable.
 */
export function attendanceGate(input: { canManageAttendance: boolean; day: string; today: string; previewing?: boolean }): AttendanceGate {
  if (input.previewing) return "view-only";
  if (input.day > input.today) return "not-yet";
  return input.canManageAttendance ? "editable" : "view-only";
}

export type CreateCheck = { ok: true; body: SundaySchoolServantsMeetingCreateRequest } | { ok: false; error: string };

/** The create form's own checks; the server repeats them and also bounds the date to the active year. */
export function checkNewMeeting(input: { ageGroupId: string; date: string; title: string }): CreateCheck {
  if (!input.ageGroupId) return { ok: false, error: "Choose a school group first." };
  if (!validDay(input.date)) return { ok: false, error: "Choose the meeting date." };
  const title = input.title.trim();
  if (title.length > MAX_MEETING_TITLE) return { ok: false, error: `Keep the title to ${MAX_MEETING_TITLE} characters or fewer.` };
  return { ok: true, body: { ageGroupId: input.ageGroupId, date: input.date, ...(title ? { title } : {}) } };
}

/**
 * What to do with a meeting the server just created or returned. Today or earlier opens it; a later date is
 * only planned (the list shows meetings up to today, and the server refuses to open a future one).
 */
export function afterCreate(meeting: Pick<SundaySchoolServantsMeetingSummary, "date">, today: string): "open" | "planned" {
  return meetingDay(meeting) > today ? "planned" : "open";
}

export const markedCount = (roster: SundaySchoolServantsMeetingAttendee[], marks: MeetingMarks) =>
  roster.filter((person) => (marks[person.id] ?? person.status) != null).length;
export const presentCount = (roster: SundaySchoolServantsMeetingAttendee[], marks: MeetingMarks) =>
  roster.filter((person) => (marks[person.id] ?? person.status) === "PRESENT").length;
export const unmarkedCount = (roster: SundaySchoolServantsMeetingAttendee[], marks: MeetingMarks) =>
  roster.length - markedCount(roster, marks);

/** Every attendee, each explicitly Present or Absent; null while anyone is unmarked (nothing is assumed absent). */
export function buildSaveBody(
  meetingId: string,
  roster: SundaySchoolServantsMeetingAttendee[],
  marks: MeetingMarks,
): SundaySchoolServantsMeetingSaveRequest | null {
  if (!roster.length) return null;
  const records: SundaySchoolServantsMeetingSaveRequest["records"] = [];
  for (const person of roster) {
    const status = marks[person.id] ?? person.status;
    if (!status) return null;
    records.push({ servantId: person.id, status });
  }
  return { meetingId, records };
}

/** After a refresh, keep a mark only for someone still on the roster; anyone new starts unmarked. */
export function reconcileMarks(marks: MeetingMarks, roster: SundaySchoolServantsMeetingAttendee[]): MeetingMarks {
  const ids = new Set(roster.map((person) => person.id));
  return Object.fromEntries(Object.entries(marks).filter(([id]) => ids.has(id)));
}

export type MeetingFailureKind = "forbidden" | "missing" | "roster" | "invalid" | "offline" | "other";

/** What went wrong, in words a servant can act on, and whether the screen must reload to stay truthful. */
export function meetingFailure(error: unknown): { kind: MeetingFailureKind; message: string; reload: boolean } {
  const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : null;
  const message = error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.";
  if (status === 403 && !/view as/i.test(message))
    return { kind: "forbidden", message: "You no longer have permission to do that for this group. Ask your coordinator if this is unexpected.", reload: true };
  if (status === 404) return { kind: "missing", message: "This meeting is no longer available.", reload: true };
  if (status === 400 && /outside this meeting roster/i.test(message))
    return { kind: "roster", message: "The servants on this roster changed. Review the list, mark anyone new, and save again.", reload: true };
  if (status === 400) return { kind: "invalid", message, reload: false };
  if (status === null) return { kind: "offline", message: "Could not reach the server. Your marks are still here; try again when you are back online.", reload: false };
  return { kind: "other", message, reload: false };
}

/** A label for the screen's header and for VoiceOver, e.g. "3 of 5 present · 1 not recorded". */
export function progressLabel(roster: SundaySchoolServantsMeetingAttendee[], marks: MeetingMarks): string {
  const unmarked = unmarkedCount(roster, marks);
  return `${presentCount(roster, marks)} of ${roster.length} present${unmarked > 0 ? ` · ${unmarked} not recorded` : ""}`;
}
