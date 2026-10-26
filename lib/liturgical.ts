/**
 * The Coptic Orthodox church calendar, as the app shows it.
 *
 * Types and pure helpers only, so client components can import this. The data
 * comes from the Coptic IO API (https://api.coptic.io) through the server-side
 * client in `lib/coptic-io.ts` and the `/api/liturgical/*` routes. See
 * docs/coptic-io.md.
 *
 * This is reference content shared by both modes: it carries no user data,
 * confers no authority, and must never be wired into prep or Sunday School
 * permission checks.
 */

import type { ChurchSeason, ReadingCycle } from '@/lib/liturgical-cycle'

export type { ChurchSeason, ChurchSeasonKey, ReadingCycle, ReadingCycleKind } from '@/lib/liturgical-cycle'

export type LiturgicalLanguage = 'en' | 'ar'

export const LITURGICAL_LANGUAGES: readonly LiturgicalLanguage[] = ['en', 'ar']

export function parseLiturgicalLanguage(value: string | null | undefined): LiturgicalLanguage {
  return value === 'ar' ? 'ar' : 'en'
}

export interface CopticDateInfo {
  day: number
  month: number
  year: number
  monthName: string
  /** "1 Paopi 1743 A.M." */
  label: string
}

export type FeastCategory = 'majorFeast' | 'minorFeast' | 'otherFeast' | 'fast' | 'commemoration'

export interface LiturgicalFeast {
  name: string
  category: FeastCategory
}

export interface LiturgicalFast {
  /** The fast's name, e.g. "Nativity Fast" or "Wednesday Fast". */
  name: string
  type: string | null
}

/** The church season, computed locally (lib/liturgical-cycle.ts), not taken from Coptic IO. */
export type LiturgicalSeason = ChurchSeason

export interface ReadingReference {
  key: ReadingKey
  label: string
  service: ReadingService
  reference: string
}

export interface LiturgicalSaint {
  name: string
}

/** One day of the church calendar, summarized. Every part is optional because each comes from its own upstream call. */
export interface LiturgicalDay {
  /** Gregorian calendar day, YYYY-MM-DD. */
  date: string
  language: LiturgicalLanguage
  copticDate: CopticDateInfo | null
  season: LiturgicalSeason
  /** What the day is within its cycle, e.g. "Monday of the third week of Great Lent" or "2nd Sunday of Baba". */
  seasonDay: string | null
  /** null when fasting status could not be loaded; `{ fast: null }` is a known non-fasting day. */
  fasting: { fast: LiturgicalFast | null } | null
  feasts: LiturgicalFeast[]
  saints: LiturgicalSaint[]
  /** The Katameros cycle the day reads from. When `readingCycle.available` is false, `readings` is empty. */
  readingCycle: ReadingCycle
  readings: ReadingReference[]
  /** False when every upstream call failed; the UI shows a quiet fallback. */
  available: boolean
}

export interface ScriptureVerse {
  num: number
  text: string
}

export interface ScripturePassage {
  bookName: string
  /** "Luke 4:1-13", built from the returned chapters. */
  reference: string
  chapters: { chapter: number; verses: ScriptureVerse[] }[]
}

export interface ReadingSection {
  key: ReadingKey
  label: string
  service: ReadingService
  passages: ScripturePassage[]
}

export interface SynaxariumStory {
  name: string
  text: string | null
}

/** The full Katameros for one day, with verse text. */
export interface DailyReadings {
  date: string
  language: LiturgicalLanguage
  copticDate: CopticDateInfo | null
  season: string
  seasonDay: string | null
  readingCycle: ReadingCycle
  /** The day's readings; empty when Coptic IO doesn't have the day's cycle (`readingCycle.available` is false). */
  sections: ReadingSection[]
  /**
   * Only when the day's cycle is unavailable: the annual readings Coptic IO has
   * for the Coptic date (`readingCycle.annualDay`). Not the day's readings.
   */
  annualSections: ReadingSection[]
  synaxarium: SynaxariumStory[]
}

/** Calendar annotations for one day, used beside lesson schedules. */
export interface LiturgicalCalendarDay {
  date: string
  copticDate: CopticDateInfo | null
  fast: LiturgicalFast | null
  feasts: LiturgicalFeast[]
}

export interface LiturgicalCalendarResponse {
  days: Record<string, LiturgicalCalendarDay>
}

// ── Katameros sections ──────────────────────────────────────────────────────

export type ReadingService = 'vespers' | 'matins' | 'liturgy' | 'evening'

export const READING_SERVICE_LABELS: Record<ReadingService, string> = {
  vespers: 'Vespers',
  matins: 'Matins',
  liturgy: 'Divine Liturgy',
  evening: 'Evening',
}

/**
 * The Katameros fields in the order they are read. The keys are the Coptic IO
 * API's field names; Prophecies are read at Matins during Great Lent and the
 * EP* readings at the Lenten Sunday evening service.
 */
export const READING_KEYS = [
  'VPsalm',
  'VGospel',
  'Prophecies',
  'MPsalm',
  'MGospel',
  'Pauline',
  'Catholic',
  'Acts',
  'LPsalm',
  'LGospel',
  'EPPsalm',
  'EPGospel',
] as const

export type ReadingKey = (typeof READING_KEYS)[number]

export const READING_DEFINITIONS: Record<ReadingKey, { label: string; service: ReadingService }> = {
  VPsalm: { label: 'Vespers Psalm', service: 'vespers' },
  VGospel: { label: 'Vespers Gospel', service: 'vespers' },
  Prophecies: { label: 'Prophecies', service: 'matins' },
  MPsalm: { label: 'Matins Psalm', service: 'matins' },
  MGospel: { label: 'Matins Gospel', service: 'matins' },
  Pauline: { label: 'Pauline Epistle', service: 'liturgy' },
  Catholic: { label: 'Catholic Epistle', service: 'liturgy' },
  Acts: { label: 'Acts (Praxis)', service: 'liturgy' },
  LPsalm: { label: 'Liturgy Psalm', service: 'liturgy' },
  LGospel: { label: 'Liturgy Gospel', service: 'liturgy' },
  EPPsalm: { label: 'Evening Psalm', service: 'evening' },
  EPGospel: { label: 'Evening Gospel', service: 'evening' },
}

export function isReadingKey(value: string): value is ReadingKey {
  return (READING_KEYS as readonly string[]).includes(value)
}

/** The Liturgy Gospel, or the nearest substitute, as the day's headline reading. */
export function headlineReading(readings: ReadingReference[]): ReadingReference | null {
  for (const key of ['LGospel', 'MGospel', 'VGospel', 'EPGospel'] as const) {
    const found = readings.find((reading) => reading.key === key)
    if (found) return found
  }
  return readings[0] ?? null
}

// ── Feasts and fasts ────────────────────────────────────────────────────────

const FEAST_RANK: Record<FeastCategory, number> = {
  majorFeast: 0,
  minorFeast: 1,
  otherFeast: 2,
  fast: 3,
  commemoration: 4,
}

const FEAST_CATEGORIES = Object.keys(FEAST_RANK) as FeastCategory[]

export function parseFeastCategory(category: unknown, type?: unknown): FeastCategory {
  if (typeof category === 'string' && (FEAST_CATEGORIES as string[]).includes(category)) {
    return category as FeastCategory
  }
  // `type` is deprecated upstream and inconsistent; fall back to it only when
  // `category` is absent.
  if (type === 'majorFeast' || type === 'lordlyFeast') return 'majorFeast'
  if (type === 'minorFeast') return 'minorFeast'
  if (type === 'fast') return 'fast'
  return 'otherFeast'
}

/** Major feasts of the Lord first, then minor, other feasts, fasts and commemorations; de-duplicated by name. */
export function sortFeasts(feasts: LiturgicalFeast[]): LiturgicalFeast[] {
  const seen = new Set<string>()
  return feasts
    .filter((feast) => {
      const key = feast.name.trim().toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => FEAST_RANK[a.category] - FEAST_RANK[b.category])
}

/** Feasts worth flagging on a schedule: everything except the monthly commemoration and fasts (shown separately). */
export function notableFeasts(feasts: LiturgicalFeast[]): LiturgicalFeast[] {
  return feasts.filter((feast) => feast.category !== 'commemoration' && feast.category !== 'fast')
}

export function isLordlyFeast(feast: LiturgicalFeast): boolean {
  return feast.category === 'majorFeast' || feast.category === 'minorFeast'
}

export const FEAST_CATEGORY_LABELS: Record<FeastCategory, string> = {
  majorFeast: 'Major feast',
  minorFeast: 'Minor feast',
  otherFeast: 'Feast',
  fast: 'Fast',
  commemoration: 'Commemoration',
}

// ── Dates ───────────────────────────────────────────────────────────────────

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

/** Coptic IO answers for 1583–9999, and its month view for 1900–2199; stay inside both. */
export const LITURGICAL_MIN_YEAR = 1900
export const LITURGICAL_MAX_YEAR = 2199

/** A real calendar day in YYYY-MM-DD form within the supported years. */
export function isLiturgicalDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = DATE_KEY.exec(value)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number)
  if (year < LITURGICAL_MIN_YEAR || year > LITURGICAL_MAX_YEAR) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** Shift a YYYY-MM-DD key by whole days, in UTC so no timezone can move it. */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function formatCopticDate(day: number, monthName: string, year: number): string {
  return `${day} ${monthName} ${year} A.M.`
}

/** "Luke 4:1-13" or "Psalms 96:1-2; 97:3" from the chapters a reading returned. */
export function formatPassageReference(bookName: string, chapters: ScripturePassage['chapters']): string {
  const parts = chapters
    .filter((chapter) => chapter.verses.length > 0)
    .map((chapter) => {
      const first = chapter.verses[0].num
      const last = chapter.verses[chapter.verses.length - 1].num
      return first === last ? `${chapter.chapter}:${first}` : `${chapter.chapter}:${first}-${last}`
    })
  if (parts.length === 0) {
    const numbers = chapters.map((chapter) => chapter.chapter).join(', ')
    return numbers ? `${bookName} ${numbers}` : bookName
  }
  return `${bookName} ${parts.join('; ')}`
}

// ── Calendar subscription ───────────────────────────────────────────────────

/**
 * Coptic IO's public iCalendar feed: feasts, fasting periods and season starts
 * for last year through two years ahead, refreshed daily by the calendar app.
 * People's calendar apps fetch it straight from Coptic IO; nothing about them
 * passes through this app.
 */
export const COPTIC_CALENDAR_FEED_URL = 'https://api.coptic.io/api/calendar/ical/subscribe'
export const COPTIC_CALENDAR_NAME = 'Coptic Orthodox Calendar'

export interface CalendarSubscriptionLinks {
  /** Apple Calendar, Outlook desktop and most phone calendars. */
  webcal: string
  google: string
  outlookWeb: string
  /** The plain feed URL, for "subscribe from URL" dialogs. */
  https: string
}

export function calendarSubscriptionLinks(feedUrl: string = COPTIC_CALENDAR_FEED_URL): CalendarSubscriptionLinks {
  const webcal = feedUrl.replace(/^https?:\/\//, 'webcal://')
  return {
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    outlookWeb: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent(COPTIC_CALENDAR_NAME)}`,
    https: feedUrl,
  }
}

/** The church's time zone; "today" on every liturgical surface means today here. */
export const CHURCH_TIME_ZONE = 'America/New_York'

/**
 * Seconds until the next midnight at the church: how long "today's" calendar
 * stays true. Off by an hour on the two DST-change nights, which is harmless
 * for a cache lifetime; never less than a minute.
 */
export function secondsUntilChurchMidnight(now: Date = new Date(), timeZone: string = CHURCH_TIME_ZONE): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now)
  const part = (type: 'hour' | 'minute' | 'second') => Number(parts.find((value) => value.type === type)?.value ?? 0)
  const elapsed = part('hour') * 3600 + part('minute') * 60 + part('second')
  return Math.max(60, 86400 - elapsed)
}
