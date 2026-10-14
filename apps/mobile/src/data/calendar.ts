// Date math and event assembly for the Calendar tab.
//
// Everything is keyed by a plain `YYYY-MM-DD` calendar day and computed in UTC,
// never from a device-local `Date`, so a day is the same day for everybody and
// a daylight-saving change can't shift a cell. Pure, so it is unit tested.

export type DateKey = string;

const MS_PER_DAY = 86_400_000;

function utcMs(key: DateKey): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function keyFromMs(ms: number): DateKey {
  const d = new Date(ms);
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && keyFromMs(utcMs(value)) === value;
}

/** Today's calendar day on this device (the person's own wall clock). */
export function todayKey(now: Date = new Date()): DateKey {
  const y = String(now.getFullYear()).padStart(4, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(key: DateKey, days: number): DateKey {
  return keyFromMs(utcMs(key) + days * MS_PER_DAY);
}

/** First day of the month `months` away from `key`'s month (negative = earlier). */
export function addMonths(key: DateKey, months: number): DateKey {
  const [y, m] = key.split("-").map(Number);
  return keyFromMs(Date.UTC(y, m - 1 + months, 1));
}

export function startOfMonth(key: DateKey): DateKey {
  return `${key.slice(0, 7)}-01`;
}

export function sameMonth(a: DateKey, b: DateKey): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(key: DateKey): number {
  return new Date(utcMs(key)).getUTCDay();
}

/** The seven days (Sunday first) of the week containing `key`. */
export function weekOf(key: DateKey): DateKey[] {
  const start = addDays(key, -weekday(key));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Whole weeks (Sunday first) that cover the month containing `key`: 28–42 cells. */
export function monthGrid(key: DateKey): DateKey[] {
  const first = startOfMonth(key);
  const last = addDays(addMonths(first, 1), -1);
  const start = addDays(first, -weekday(first));
  const end = addDays(last, 6 - weekday(last));
  const days = Math.round((utcMs(end) - utcMs(start)) / MS_PER_DAY) + 1;
  return Array.from({ length: days }, (_, i) => addDays(start, i));
}

export function monthParts(key: DateKey): { month: string; year: string } {
  const d = new Date(utcMs(key));
  return {
    month: d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }),
    year: String(d.getUTCFullYear()),
  };
}

export function formatLongDay(key: DateKey): string {
  return new Date(utcMs(key)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatShortDay(key: DateKey): string {
  return new Date(utcMs(key)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatWeekRange(days: DateKey[]): string {
  const first = new Date(utcMs(days[0]));
  const last = new Date(utcMs(days[days.length - 1]));
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const sameMonthRange = first.getUTCMonth() === last.getUTCMonth();
  return sameMonthRange
    ? `${month(first)} ${first.getUTCDate()} – ${last.getUTCDate()}`
    : `${month(first)} ${first.getUTCDate()} – ${month(last)} ${last.getUTCDate()}`;
}

// ── Events ──────────────────────────────────────────────────────────────────

export type CalendarEventKind =
  | "attendance-due"
  | "lesson"
  | "attendance-taken"
  | "feast"
  | "fast";

export interface CalendarEvent {
  id: string;
  date: DateKey;
  kind: CalendarEventKind;
  title: string;
  subtitle?: string;
  /** Where tapping it goes; omitted for things with nothing to open (a feast). */
  route?: { pathname: string; params?: Record<string, string> };
}

export interface CalendarLessonInput {
  id: string;
  classId: string;
  sundayDate: string;
  title: string | null;
  class: { name: string };
}

export interface CalendarLiturgicalDay {
  fast: { name: string } | null;
  feasts: { name: string; category: string }[];
}

export interface CalendarEventSources {
  lessons: CalendarLessonInput[];
  /** A class's attendance that is still owed for a meeting that has happened. */
  attendanceDue: { classId: string; className: string; date: DateKey }[];
  /** Attendance already recorded. */
  attendanceTaken: { classId: string; className: string; date: DateKey }[];
  liturgical: Record<DateKey, CalendarLiturgicalDay | undefined>;
}

const KIND_ORDER: Record<CalendarEventKind, number> = {
  "attendance-due": 0,
  lesson: 1,
  "attendance-taken": 2,
  feast: 3,
  fast: 4,
};

/** Feasts worth a dot on the grid; saints' commemorations stay in the day view. */
const DOT_FEAST_CATEGORIES = new Set(["majorFeast", "minorFeast"]);

export function buildCalendarEvents(sources: CalendarEventSources): Record<DateKey, CalendarEvent[]> {
  const byDay: Record<DateKey, CalendarEvent[]> = {};
  const push = (event: CalendarEvent) => {
    (byDay[event.date] ??= []).push(event);
  };

  for (const lesson of sources.lessons) {
    const date = lesson.sundayDate.slice(0, 10);
    push({
      id: `lesson:${lesson.id}`,
      date,
      kind: "lesson",
      title: lesson.title?.trim() || "Weekly lesson",
      subtitle: lesson.class.name,
      route: { pathname: "/lesson/[id]", params: { id: lesson.id, classId: lesson.classId } },
    });
  }
  for (const item of sources.attendanceDue) {
    push({
      id: `due:${item.classId}:${item.date}`,
      date: item.date,
      kind: "attendance-due",
      title: "Attendance due",
      subtitle: item.className,
      route: { pathname: "/attendance/[classId]", params: { classId: item.classId } },
    });
  }
  for (const item of sources.attendanceTaken) {
    push({
      id: `taken:${item.classId}:${item.date}`,
      date: item.date,
      kind: "attendance-taken",
      title: "Attendance taken",
      subtitle: item.className,
      route: { pathname: "/attendance/[classId]", params: { classId: item.classId } },
    });
  }
  for (const [date, day] of Object.entries(sources.liturgical)) {
    if (!day) continue;
    day.feasts.forEach((feast, index) => {
      push({ id: `feast:${date}:${index}`, date, kind: "feast", title: feast.name });
    });
    if (day.fast) push({ id: `fast:${date}`, date, kind: "fast", title: day.fast.name });
  }

  for (const events of Object.values(byDay)) {
    events.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title));
  }
  return byDay;
}

export type DotKind = "attendance-due" | "lesson" | "attendance-taken" | "feast";

/** At most three distinct marks for a grid cell, most actionable first. */
export function dayDots(
  events: CalendarEvent[] | undefined,
  liturgical: CalendarLiturgicalDay | undefined,
): DotKind[] {
  const present = new Set<DotKind>();
  for (const event of events ?? []) {
    if (event.kind === "attendance-due" || event.kind === "lesson" || event.kind === "attendance-taken") {
      present.add(event.kind);
    }
  }
  if (liturgical?.feasts.some((feast) => DOT_FEAST_CATEGORIES.has(feast.category))) present.add("feast");
  const order: DotKind[] = ["attendance-due", "lesson", "attendance-taken", "feast"];
  return order.filter((kind) => present.has(kind)).slice(0, 3);
}

/** `YYYY-MM-DD` days to ask the church-calendar endpoint about (it accepts up to 60). */
export function liturgicalDatesParam(days: DateKey[]): string {
  return days.slice(0, 60).join(",");
}
