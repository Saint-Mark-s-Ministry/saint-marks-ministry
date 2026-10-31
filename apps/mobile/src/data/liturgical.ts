// The church calendar, as the native app uses it: pure helpers over the shared
// `/api/liturgical/*` endpoints (docs/coptic-io.md).
//
// Types mirror lib/liturgical.ts on the server; the app can't import that file
// (it sits beside server-only code), so the shapes it needs are repeated here.
// Nothing in this file touches the network, a clock the caller didn't hand in,
// or a permission: it is reference content shared by both ministries.

import { getSundaySchoolTodayDateInputValue, SUNDAY_SCHOOL_TIME_ZONE } from "@stmark/domain";
import type { CopticDateInfo, FeastCategory, LiturgicalFeast } from "./readings";

export type { CopticDateInfo, FeastCategory, LiturgicalFeast };

// ── Church time ─────────────────────────────────────────────────────────────

/** The church's time zone: "today" on every liturgical surface means today here, not on the device. */
export const CHURCH_TIME_ZONE = SUNDAY_SCHOOL_TIME_ZONE;

/** Today's calendar day at the church (`YYYY-MM-DD`), whatever the device's own zone or clock setting. */
export function churchToday(now: Date = new Date()): string {
  return getSundaySchoolTodayDateInputValue(now, CHURCH_TIME_ZONE);
}

function secondsIntoChurchDay(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHURCH_TIME_ZONE,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const part = (type: "hour" | "minute" | "second") => Number(parts.find((value) => value.type === type)?.value ?? 0);
  return part("hour") * 3600 + part("minute") * 60 + part("second");
}

/**
 * Seconds until the next midnight at the church: how long "today's" calendar
 * stays true. Off by an hour on the two DST-change nights, which is harmless
 * for a cache lifetime; never less than a minute.
 */
export function secondsUntilChurchMidnight(now: Date = new Date()): number {
  return Math.max(60, 86400 - secondsIntoChurchDay(now));
}

/**
 * Milliseconds until church midnight, exact to the millisecond and with no
 * floor, for the timer that moves an open screen on to the new day. (The day
 * is 23 or 25 hours long on the two DST nights, so callers re-check often
 * rather than trust one long timer.)
 */
export function msUntilChurchMidnight(now: Date = new Date()): number {
  return 86_400_000 - secondsIntoChurchDay(now) * 1000 - now.getMilliseconds();
}

/** Coptic IO answers for 1900–2199 through the server proxy; the date controls stay inside that. */
export const LITURGICAL_MIN_DATE = "1900-01-01";
export const LITURGICAL_MAX_DATE = "2199-12-31";

/** A real calendar day, `YYYY-MM-DD`, inside the years the server accepts. */
export function isLiturgicalDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1900 || year > 2199) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Keeps a date inside the supported years (string compare is safe for zero-padded keys). */
export function clampLiturgicalDate(key: string): string {
  if (key < LITURGICAL_MIN_DATE) return LITURGICAL_MIN_DATE;
  if (key > LITURGICAL_MAX_DATE) return LITURGICAL_MAX_DATE;
  return key;
}

// ── Calendar endpoint ───────────────────────────────────────────────────────

/** `/api/liturgical/calendar` takes at most this many dates per request. */
export const CALENDAR_CHUNK_SIZE = 60;

/**
 * The distinct, valid dates sorted and split into requests of at most 60.
 * Callers hand over whatever range they are showing (a year of lessons, a
 * month grid); each chunk is a separate request so none is ever truncated.
 */
export function chunkDates(dates: readonly string[], size: number = CALENDAR_CHUNK_SIZE): string[][] {
  const unique = Array.from(new Set(dates.filter(isLiturgicalDateKey))).sort();
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += size) chunks.push(unique.slice(i, i + size));
  return chunks;
}

export function calendarPath(chunk: readonly string[]): string {
  return `/api/liturgical/calendar?dates=${chunk.join(",")}`;
}

export interface LiturgicalFast {
  name: string;
  type: string | null;
}

/** Calendar annotations for one day, as `/api/liturgical/calendar` returns them. */
export interface LiturgicalCalendarDay {
  date: string;
  copticDate: CopticDateInfo | null;
  fast: LiturgicalFast | null;
  feasts: LiturgicalFeast[];
}

export type LiturgicalCalendar = Record<string, LiturgicalCalendarDay | undefined>;

/** Feasts worth showing: everything except the monthly commemoration and fasts (those are shown separately). */
export function notableFeasts(feasts: readonly LiturgicalFeast[]): LiturgicalFeast[] {
  return feasts.filter((feast) => feast.category !== "commemoration" && feast.category !== "fast");
}

export function isLordlyFeast(feast: LiturgicalFeast): boolean {
  return feast.category === "majorFeast" || feast.category === "minorFeast";
}

export interface LiturgicalTagSet {
  copticLabel: string | null;
  feasts: LiturgicalFeast[];
  fast: string | null;
}

/** What to flag beside a date: its feasts and fast, plus the Coptic date when asked. Null when the day is ordinary. */
export function liturgicalTags(
  day: LiturgicalCalendarDay | undefined,
  options: { copticDate?: boolean } = {},
): LiturgicalTagSet | null {
  if (!day) return null;
  const feasts = notableFeasts(day.feasts);
  const fast = day.fast?.name ?? null;
  const copticLabel = options.copticDate ? (day.copticDate?.label ?? null) : null;
  if (!feasts.length && !fast && !copticLabel) return null;
  return { copticLabel, feasts, fast };
}

/** One line for a screen reader: "Nativity Fast, Feast of the Cross". */
export function liturgicalSummary(day: LiturgicalCalendarDay | undefined): string {
  if (!day) return "";
  return [...notableFeasts(day.feasts).map((feast) => feast.name), day.fast?.name].filter(Boolean).join(", ");
}

/** Where a feast or fast on `date` leads: that day's readings. */
export function readingsRoute(date: string) {
  return { pathname: "/readings", params: { date } } as const;
}

// ── Today in the Church ─────────────────────────────────────────────────────

export interface ReadingReference {
  key: string;
  label: string;
  service: string;
  reference: string;
}

export interface LiturgicalSeason {
  name: string;
  description: string | null;
}

/** `/api/liturgical/day`. Every part is optional because the server assembles it from several upstream calls. */
export interface LiturgicalDay {
  date: string;
  copticDate: CopticDateInfo | null;
  season: LiturgicalSeason | null;
  /** "Week 3, Wednesday" during Great Lent. */
  seasonDay: string | null;
  /** null when fasting could not be loaded; `{ fast: null }` is a known non-fasting day. */
  fasting: { fast: LiturgicalFast | null } | null;
  feasts: LiturgicalFeast[];
  saints: { name: string }[];
  readings: ReadingReference[];
  /** False when every upstream call failed. */
  available: boolean;
}

/** The Liturgy Gospel, or the nearest substitute, as the day's headline reading. */
export function headlineReading(readings: readonly ReadingReference[]): ReadingReference | null {
  for (const key of ["LGospel", "MGospel", "VGospel", "EPGospel"]) {
    const found = readings.find((reading) => reading.key === key);
    if (found) return found;
  }
  return readings[0] ?? null;
}

const SAINTS_SHOWN = 3;

/** "A · B · C · and 2 more" */
export function saintsSentence(names: readonly string[], shown: number = SAINTS_SHOWN): string {
  if (names.length <= shown) return names.join(" · ");
  return `${names.slice(0, shown).join(" · ")} · and ${names.length - shown} more`;
}

/** The fast chip's text: the fast's name, or "No fast today" when fasting is known and there is none. */
export function fastLabel(day: Pick<LiturgicalDay, "fasting">): { text: string; fasting: boolean } | null {
  if (!day.fasting) return null;
  return day.fasting.fast ? { text: day.fasting.fast.name, fasting: true } : { text: "No fast today", fasting: false };
}

// ── Subscribing in the phone's own calendar ─────────────────────────────────

/** Coptic IO's public iCalendar feed: feasts, fasting periods and season starts, refreshed daily by the calendar app. */
export const COPTIC_CALENDAR_FEED_URL = "https://api.coptic.io/api/calendar/ical/subscribe";
export const COPTIC_CALENDAR_NAME = "Coptic Orthodox Calendar";

export interface CalendarSubscriptionLinks {
  /** Apple Calendar: iOS opens the "Subscribe to calendar" sheet. */
  webcal: string;
  google: string;
  outlookWeb: string;
  /** The plain feed URL, for "subscribe by URL" dialogs and copying. */
  https: string;
}

export function calendarSubscriptionLinks(feedUrl: string = COPTIC_CALENDAR_FEED_URL): CalendarSubscriptionLinks {
  const webcal = feedUrl.replace(/^https?:\/\//, "webcal://");
  return {
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    outlookWeb: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent(COPTIC_CALENDAR_NAME)}`,
    https: feedUrl,
  };
}

export type SubscribeChoice = "apple" | "google" | "outlook" | "copy";

export const SUBSCRIBE_CHOICES: { id: SubscribeChoice; title: string }[] = [
  { id: "apple", title: "Apple Calendar" },
  { id: "google", title: "Google Calendar" },
  { id: "outlook", title: "Outlook.com" },
  { id: "copy", title: "Copy calendar link" },
];

/** The URL a choice opens (null for "copy", which has nothing to open). */
export function subscribeUrl(choice: SubscribeChoice, links: CalendarSubscriptionLinks = calendarSubscriptionLinks()): string | null {
  switch (choice) {
    case "apple":
      return links.webcal;
    case "google":
      return links.google;
    case "outlook":
      return links.outlookWeb;
    default:
      return null;
  }
}

// ── Date picker bridge ──────────────────────────────────────────────────────

/**
 * A native date picker works in `Date`s, which carry a zone; a calendar day
 * does not. A day is handed to the picker as noon UTC and read back from its
 * UTC fields (with the picker told to use UTC), so no device time zone, and no
 * daylight-saving change, can move the chosen day.
 */
export function pickerDateFor(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function keyFromPickerDate(date: Date): string {
  return clampLiturgicalDate(date.toISOString().slice(0, 10));
}

/**
 * A Coptic date label in Arabic ("9 بابه 1743 A.M.") mixes scripts, and its
 * closing full stop lands on the wrong side of "A.M" unless the label ends with
 * a left-to-right mark. English labels are left alone.
 */
export function copticDateText(label: string, language: "en" | "ar"): string {
  return language === "ar" ? `${label}\u200E` : label;
}
