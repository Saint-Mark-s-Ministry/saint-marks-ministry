/**
 * Pure logic for the Servants Prep Calendar (SMM-33), pulled out of the
 * screen component so the grid math, event bucketing, and role gating are
 * unit-testable without rendering native UI.
 *
 * Event types rendered here are deliberately limited to "lesson" and "exam"
 * — the two types with a confirmed, listable backend source
 * (`/api/lessons`, `/api/exams`). Expected absences, Sunday School serving
 * stints, and async-deadline events from the design source are omitted:
 * `/api/expected-absences` only supports a single-lesson lookup (`?lessonId=`),
 * not "list in a date range", and no serving-stint endpoint exists at all.
 * Per this project's established scope-honesty rule, these are left out
 * rather than faked, and the gap is called out in the PR description.
 */

import { PREP_ADMIN_ROLES } from "./prep-home";

export { PREP_ADMIN_ROLES };

/** Only admin-like roles may use the Today/New-event actions or see the operational calendar. */
export function canManageCalendar(role?: string | null): boolean {
  return !!role && PREP_ADMIN_ROLES.includes(role);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** The device's local calendar date (Y-M-D), never shifted to UTC — unlike `toISOString().slice(0,10)`. */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A 42-cell grid (6 full weeks, Sunday-first) covering `monthStart`'s month, matching the design source. */
export function monthGrid(monthStart: Date): Date[] {
  const gridStart = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

/** The Sunday-first week (7 cells) containing `anchor`. */
export function weekStrip(anchor: Date): Date[] {
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - anchor.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export type CalendarEventType = "lesson" | "exam";

export type CalendarEvent = {
  id: string;
  type: CalendarEventType;
  /** YYYY-MM-DD, the date portion of the source record's own timestamp string (matches every other screen's convention). */
  date: string;
  time: string | null;
  title: string;
  subtitle: string;
};

export type LessonForCalendar = {
  id: string;
  scheduledDate: string;
  status: "SCHEDULED" | "CANCELLED" | "NO_CLASS" | "COMPLETED";
  isExamDay?: boolean;
  lessonNumber: number;
  examSection?: { displayName: string } | null;
  _count?: { attendanceRecords: number };
};

export type ExamForCalendar = {
  id: string;
  examDate: string;
  totalPoints: number;
  examSection?: { displayName: string } | null;
};

/** Renders "7:30 PM" from an ISO timestamp, or null for a midnight (all-day) stamp. */
export function formatEventTime(iso: string): string | null {
  const d = new Date(iso);
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return null;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Builds the unified, sorted event list the Calendar screen renders, from the two confirmed data sources. */
export function buildCalendarEvents(
  lessons: LessonForCalendar[],
  exams: ExamForCalendar[],
): CalendarEvent[] {
  const lessonEvents: CalendarEvent[] = lessons
    .filter((l) => l.status !== "CANCELLED" && l.status !== "NO_CLASS")
    .map((l) => ({
      id: `lesson-${l.id}`,
      type: "lesson",
      date: l.scheduledDate.slice(0, 10),
      time: formatEventTime(l.scheduledDate),
      title: l.isExamDay ? "Exam day" : `Lesson ${l.lessonNumber}`,
      subtitle: l.examSection?.displayName ?? "All sections",
    }));
  const examEvents: CalendarEvent[] = exams.map((e) => ({
    id: `exam-${e.id}`,
    type: "exam",
    date: e.examDate.slice(0, 10),
    time: formatEventTime(e.examDate),
    title: "Exam",
    subtitle: `${e.examSection?.displayName ?? "All sections"} · ${e.totalPoints} pts`,
  }));
  return [...lessonEvents, ...examEvents].sort((a, b) => a.date.localeCompare(b.date));
}

/** Groups already-built events by their date key. */
export function eventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    map.set(event.date, [...(map.get(event.date) ?? []), event]);
  }
  return map;
}

/** Up to 2 dot colors for a grid day, one per distinct event type present, lesson before exam. */
export function dotTypesForDay(events: CalendarEvent[]): CalendarEventType[] {
  const types: CalendarEventType[] = [];
  if (events.some((e) => e.type === "lesson")) types.push("lesson");
  if (events.some((e) => e.type === "exam")) types.push("exam");
  return types.slice(0, 2);
}
