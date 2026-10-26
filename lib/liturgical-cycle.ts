/**
 * Which part of the Church's year a day belongs to, and which Katameros cycle
 * its readings come from: computed here rather than taken from Coptic IO.
 *
 * Coptic IO selects readings by Coptic month and day, with overrides only for
 * Great Lent and Jonah's Fast. It has no Sunday cycle, no Pascha (Holy Week)
 * readings and no Holy 50 readings, so on those days it returns the annual
 * reading for the Coptic date (e.g. "8 Baba" on the 2nd Sunday of Baba). Its
 * season endpoint likewise knows only six seasons and calls every other day
 * "Ordinary Time". This module lets the app say what the day really is and
 * withhold readings that belong to a different day. See docs/coptic-io.md,
 * "Reading cycles and seasons".
 *
 * Pure and client-safe. Every input and output is a YYYY-MM-DD key, computed in
 * whole days, so no time zone can shift the liturgical day.
 */

import type { LiturgicalLanguage } from '@/lib/liturgical'

// ── Calendar arithmetic ─────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000
/** Julian Day Number of 1970-01-01. */
const UNIX_EPOCH_JDN = 2_440_588
/** Julian Day Number of 1 Tout 1 A.M. (29 August 284, Julian). */
const COPTIC_EPOCH_JDN = 1_825_030

function dateKeyToJdn(dateKey: string): number {
  return Math.round(Date.parse(`${dateKey}T00:00:00Z`) / MS_PER_DAY) + UNIX_EPOCH_JDN
}

function jdnToDateKey(jdn: number): string {
  return new Date((jdn - UNIX_EPOCH_JDN) * MS_PER_DAY).toISOString().slice(0, 10)
}

function copticToJdn(year: number, month: number, day: number): number {
  return COPTIC_EPOCH_JDN - 1 + 365 * (year - 1) + Math.floor(year / 4) + 30 * (month - 1) + day
}

function julianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12)
  const y = year + 4800 - a
  const m = month + 12 * a - 3
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083
}

/** Coptic month names as Coptic IO spells them in English. */
export const COPTIC_MONTH_NAMES = [
  'Tout', 'Baba', 'Hator', 'Kiahk', 'Toba', 'Amshir', 'Baramhat',
  'Baramouda', 'Bashans', 'Paona', 'Epep', 'Mesra', 'Nasie',
] as const

const TOUT = 1, HATOR = 3, KIAHK = 4, TOBA = 5, AMSHIR = 6, BARAMHAT = 7, BASHANS = 9, EPEP = 11, MESRA = 12

export interface CopticDate {
  year: number
  /** 1 (Tout) … 13 (Nasie). */
  month: number
  day: number
}

export function gregorianToCoptic(dateKey: string): CopticDate {
  const jdn = dateKeyToJdn(dateKey)
  const year = Math.floor((4 * (jdn - COPTIC_EPOCH_JDN) + 1463) / 1461)
  const month = Math.floor((jdn - copticToJdn(year, 1, 1)) / 30) + 1
  const day = jdn - copticToJdn(year, month, 1) + 1
  return { year, month, day }
}

export function copticToGregorian({ year, month, day }: CopticDate): string {
  return jdnToDateKey(copticToJdn(year, month, day))
}

/** The Coptic (Orthodox) Feast of the Resurrection in a Gregorian year. */
export function orthodoxEaster(year: number): string {
  // Meeus' Julian computus, then converted to the Gregorian calendar.
  const a = year % 4
  const b = year % 7
  const c = year % 19
  const d = (19 * c + 15) % 30
  const e = (2 * a + 4 * b - d + 34) % 7
  const month = Math.floor((d + e + 114) / 31)
  const day = ((d + e + 114) % 31) + 1
  return jdnToDateKey(julianToJdn(year, month, day))
}

/** Whole days from that Gregorian year's Feast of the Resurrection (negative before). */
export function daysFromEaster(dateKey: string): number {
  return dateKeyToJdn(dateKey) - dateKeyToJdn(orthodoxEaster(Number(dateKey.slice(0, 4))))
}

/** 0 = Sunday … 6 = Saturday. */
function weekday(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay()
}

function shift(dateKey: string, days: number): string {
  return jdnToDateKey(dateKeyToJdn(dateKey) + days)
}

function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'
  return `${n}${suffix}`
}

// ── Seasons ─────────────────────────────────────────────────────────────────

export type ChurchSeasonKey =
  | 'annual'
  | 'festive'
  | 'advent'
  | 'nativityParamoun'
  | 'nativity'
  | 'theophanyParamoun'
  | 'theophany'
  | 'jonah'
  | 'greatLent'
  | 'holyWeek'
  | 'holy50'
  | 'apostlesFast'
  | 'stMarysFast'

export interface ChurchSeason {
  key: ChurchSeasonKey
  /** Display name in the requested language, e.g. "Annual Days". */
  name: string
  /** First and last day of the period (YYYY-MM-DD); null for Annual and Festive Days, which are scattered. */
  startDate: string | null
  endDate: string | null
}

const SEASON_NAMES: Record<ChurchSeasonKey, { en: string; ar: string }> = {
  annual: { en: 'Annual Days', ar: 'الأيام السنوية' },
  festive: { en: 'Festive Days', ar: 'الأيام الفرايحي' },
  advent: { en: 'Advent', ar: 'صوم الميلاد' },
  nativityParamoun: { en: 'Nativity Paramoun', ar: 'برامون الميلاد' },
  nativity: { en: 'Nativity Period', ar: 'فترة عيد الميلاد' },
  theophanyParamoun: { en: 'Theophany Paramoun', ar: 'برامون الغطاس' },
  theophany: { en: 'Theophany Period', ar: 'فترة عيد الغطاس' },
  jonah: { en: 'Jonah’s Fast', ar: 'صوم يونان' },
  greatLent: { en: 'Great Lent', ar: 'الصوم الكبير' },
  holyWeek: { en: 'Holy Week', ar: 'أسبوع الآلام' },
  holy50: { en: 'Holy 50s', ar: 'الخماسين المقدسة' },
  apostlesFast: { en: 'Apostles’ Fast', ar: 'صوم الرسل' },
  stMarysFast: { en: 'St. Mary’s Fast', ar: 'صوم السيدة العذراء' },
}

/** Day-specific names within a period. */
const DAY_NAMES = {
  // Kiahk's own praises and tune run from 1 Kiahk until the Nativity Paramoun.
  kiahk: { en: 'Advent · Kiahk', ar: 'صوم الميلاد · شهر كيهك' },
  nativityFeast: { en: 'Nativity Feast', ar: 'عيد الميلاد المجيد' },
  theophanyFeast: { en: 'Theophany Feast', ar: 'عيد الغطاس المجيد' },
  jonahPassover: { en: 'Jonah’s Passover', ar: 'فصح يونان' },
} as const

/**
 * The Paramoun is the eve of the feast. Saturdays and Sundays are never strict
 * fast days, so when the feast falls on a Sunday or Monday the Paramoun reaches
 * back to the Friday before.
 */
function paramounStart(feast: string): string {
  const day = weekday(feast)
  if (day === 0) return shift(feast, -2) // Sunday feast: Friday and Saturday
  if (day === 1) return shift(feast, -3) // Monday feast: Friday, Saturday and Sunday
  return shift(feast, -1)
}

/**
 * Fixed days kept with the joyful tune outside the fasting seasons: Nayrouz
 * through the Feast of the Cross (1–19 Tout), the fixed feasts of the Lord, and
 * the monthly commemoration of the Annunciation, Nativity and Resurrection on
 * the 29th (not kept in Toba and Amshir).
 */
function isFestiveDay({ month, day }: CopticDate): boolean {
  if (month === TOUT && day <= 19) return true
  if (day === 29 && month !== TOBA && month !== AMSHIR && month <= MESRA) return true
  return LORDLY_FEAST_DAYS.some(([m, d]) => m === month && d === day)
}

/** Fixed feasts of the Lord (Coptic month, day), whose readings outrank the Sunday cycle. */
const LORDLY_FEAST_DAYS: readonly (readonly [number, number])[] = [
  [TOUT, 1], // Nayrouz
  [TOUT, 17], // Feast of the Cross
  [KIAHK, 28], // Nativity Paramoun (eve)
  [KIAHK, 29], // Nativity
  [TOBA, 6], // Circumcision
  [TOBA, 10], // Theophany Paramoun (eve)
  [TOBA, 11], // Theophany
  [TOBA, 13], // Wedding at Cana
  [AMSHIR, 8], // Entrance into the Temple
  [BARAMHAT, 10], // Appearance of the Cross
  [BARAMHAT, 29], // Annunciation
  [BASHANS, 24], // Entry into Egypt
  [MESRA, 13], // Transfiguration
]

/**
 * The season a day belongs to, using the taxonomy the church asked for
 * (SMM-117). Overlaps resolve in this order: Holy Week, Great Lent, the Holy
 * 50s, Jonah's Fast and Passover, the Apostles' and St. Mary's Fasts, the
 * Nativity and Theophany cycle, then Festive Days, and otherwise Annual Days.
 */
export function getChurchSeason(dateKey: string, language: LiturgicalLanguage = 'en'): ChurchSeason {
  const name = (names: { en: string; ar: string }) => names[language]
  const season = (key: ChurchSeasonKey, startDate: string | null, endDate: string | null, dayName?: { en: string; ar: string }) => ({
    key,
    name: name(dayName ?? SEASON_NAMES[key]),
    startDate,
    endDate,
  })

  const year = Number(dateKey.slice(0, 4))
  const easter = orthodoxEaster(year)
  const offset = daysFromEaster(dateKey)
  const coptic = gregorianToCoptic(dateKey)

  if (offset >= -7 && offset <= -1) return season('holyWeek', shift(easter, -7), shift(easter, -1))
  if (offset >= -55 && offset <= -8) return season('greatLent', shift(easter, -55), shift(easter, -8))
  if (offset >= 0 && offset <= 49) return season('holy50', easter, shift(easter, 49))
  if (offset >= -69 && offset <= -66) {
    return season('jonah', shift(easter, -69), shift(easter, -66), offset === -66 ? DAY_NAMES.jonahPassover : undefined)
  }

  // The Apostles' Fast runs from the day after Pentecost to the eve of the
  // Feast of the Apostles (5 Epep); a late Pentecost can leave it very short.
  const apostlesFeast = copticToGregorian({ year: gregorianToCoptic(`${year}-07-01`).year, month: EPEP, day: 5 })
  if (offset >= 50 && dateKey < apostlesFeast) return season('apostlesFast', shift(easter, 50), shift(apostlesFeast, -1))

  if (coptic.month === MESRA && coptic.day <= 15) {
    return season('stMarysFast', copticToGregorian({ ...coptic, day: 1 }), copticToGregorian({ ...coptic, day: 15 }))
  }

  // Advent (16 Hator) → Nativity Paramoun → Nativity (29 Kiahk) → Theophany
  // Paramoun → Theophany (11 Toba) through the Wedding at Cana (13 Toba). The
  // Coptic year that holds this stretch starts the September before January.
  if (coptic.month === HATOR || coptic.month === KIAHK || coptic.month === TOBA) {
    const nativity = copticToGregorian({ year: coptic.year, month: KIAHK, day: 29 })
    const theophany = copticToGregorian({ year: coptic.year, month: TOBA, day: 11 })
    const adventStart = copticToGregorian({ year: coptic.year, month: HATOR, day: 16 })
    const nativityParamoun = paramounStart(nativity)
    const theophanyParamoun = paramounStart(theophany)
    const cana = shift(theophany, 2)

    if (dateKey >= adventStart && dateKey < nativityParamoun) {
      return season('advent', adventStart, shift(nativityParamoun, -1), coptic.month === KIAHK ? DAY_NAMES.kiahk : undefined)
    }
    if (dateKey >= nativityParamoun && dateKey < nativity) return season('nativityParamoun', nativityParamoun, shift(nativity, -1))
    if (dateKey >= nativity && dateKey < theophanyParamoun) {
      return season('nativity', nativity, shift(theophanyParamoun, -1), dateKey === nativity ? DAY_NAMES.nativityFeast : undefined)
    }
    if (dateKey >= theophanyParamoun && dateKey < theophany) return season('theophanyParamoun', theophanyParamoun, shift(theophany, -1))
    if (dateKey >= theophany && dateKey <= cana) {
      return season('theophany', theophany, cana, dateKey === theophany ? DAY_NAMES.theophanyFeast : undefined)
    }
  }

  if (isFestiveDay(coptic)) return season('festive', null, null)
  return season('annual', null, null)
}

// ── Reading cycles ──────────────────────────────────────────────────────────

/**
 * - `annual`: the Katameros of the days, by Coptic month and day (also fixed feasts)
 * - `sunday`: the Sunday Katameros (1st–5th Sunday of each Coptic month)
 * - `jonah`, `greatLent`: the moveable Lenten Katameros
 * - `pascha`: the Pascha book, Monday to Saturday of Holy Week
 * - `holy50`: the Katameros of the Holy 50s, Resurrection to Pentecost
 */
export type ReadingCycleKind = 'annual' | 'sunday' | 'jonah' | 'greatLent' | 'pascha' | 'holy50'

export interface ReadingCycle {
  kind: ReadingCycleKind
  /** What the day's readings are, e.g. "2nd Sunday of Baba", "8 Baba", "Day 12 of the Holy 50s". */
  label: string
  /** The Coptic date whose annual readings Coptic IO returns for this day, e.g. "8 Baba". */
  annualDay: string
  /**
   * Whether Coptic IO serves this cycle. When false, the readings it returns
   * are the annual readings for `annualDay`, not this day's.
   */
  available: boolean
}

/** Cycles Coptic IO has data for. Keep in step with its moveable readings (Lent −57…−7, Jonah −69…−66 days from Easter). */
const UPSTREAM_CYCLES: ReadonlySet<ReadingCycleKind> = new Set(['annual', 'jonah', 'greatLent'])

const PASCHA_DAYS = ['Monday of Holy Week', 'Tuesday of Holy Week', 'Wednesday of Holy Week', 'Covenant Thursday', 'Good Friday', 'Holy Saturday']

function holy50Label(offset: number): string {
  if (offset === 0) return 'Feast of the Resurrection'
  if (offset === 7) return 'Thomas Sunday'
  if (offset === 39) return 'Feast of the Ascension'
  if (offset === 49) return 'Feast of Pentecost'
  return `Day ${offset + 1} of the Holy 50s`
}

/**
 * The Katameros cycle a day's readings come from. Precedence: the Holy 50s and
 * the Pascha book, then Great Lent (from its preparation weekend) and Jonah's
 * Fast, then the fixed feasts of the Lord, then Sundays, then the annual days.
 */
export function getReadingCycle(dateKey: string): ReadingCycle {
  const offset = daysFromEaster(dateKey)
  const coptic = gregorianToCoptic(dateKey)
  const monthName = COPTIC_MONTH_NAMES[coptic.month - 1]
  const annualDay = `${coptic.day} ${monthName}`
  const cycle = (kind: ReadingCycleKind, label: string): ReadingCycle => ({ kind, label, annualDay, available: UPSTREAM_CYCLES.has(kind) })

  if (offset >= 0 && offset <= 49) return cycle('holy50', holy50Label(offset))
  if (offset >= -6 && offset <= -1) return cycle('pascha', PASCHA_DAYS[offset + 6])
  if (offset >= -57 && offset <= -7) return cycle('greatLent', offset === -7 ? 'Palm Sunday' : 'Great Lent')
  if (offset >= -69 && offset <= -66) return cycle('jonah', offset === -66 ? 'Jonah’s Passover' : 'Jonah’s Fast')

  const isLordlyFeast = LORDLY_FEAST_DAYS.some(([m, d]) => m === coptic.month && d === coptic.day)
  if (weekday(dateKey) === 0 && !isLordlyFeast) {
    const nth = Math.ceil(coptic.day / 7)
    return cycle('sunday', `${ordinal(nth)} Sunday of ${monthName}`)
  }
  return cycle('annual', annualDay)
}
