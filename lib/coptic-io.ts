// Server-only: imported by API routes. Client code imports types from lib/liturgical.
import { z } from 'zod'
import { UpstreamCache, type CachePolicy, type LoadOutcome } from '@/lib/coptic-io-cache'
import { parseJsonBody } from '@/lib/coptic-io-body'
import {
  secondsUntilChurchMidnight,
  READING_DEFINITIONS,
  READING_KEYS,
  formatCopticDate,
  formatPassageReference,
  parseFeastCategory,
  sortFeasts,
  type CopticDateInfo,
  type DailyReadings,
  type LiturgicalCalendarDay,
  type LiturgicalDay,
  type LiturgicalFast,
  type LiturgicalFeast,
  type LiturgicalLanguage,
  type LiturgicalSeason,
  type ReadingReference,
  type ReadingSection,
} from '@/lib/liturgical'

/**
 * Server-side client for the Coptic IO API (https://api.coptic.io): the Coptic
 * calendar, Katameros readings, Synaxarium, fasts, feasts and seasons.
 *
 * - Only calendar days leave this app. No user, child or session data is sent.
 * - Every call is bounded by a timeout and resolves to null on any failure, so
 *   a Coptic IO outage degrades a card instead of breaking a dashboard.
 * - Responses are validated with zod before use; the API is a third party.
 * - Dates are always sent explicitly as YYYY-MM-DD. The API's own "today" is
 *   the Cloudflare edge's clock, not the church's, so it is never relied on.
 * - Answers for an explicit date never change, so they are cached in two
 *   layers: Next's data cache (shared, 7 days, stale-while-revalidate) and an
 *   in-process cache with coalescing, stale-if-error, negative caching and a
 *   circuit breaker (lib/coptic-io-cache.ts).
 *
 * See docs/coptic-io.md.
 */

export const COPTIC_IO_DEFAULT_BASE_URL = 'https://api.coptic.io'
const TIMEOUT_MS = 5000
/** Dated answers only change when Coptic IO corrects its data; `revalidateTag('coptic-io')` forces it sooner. */
const REVALIDATE_SECONDS = 60 * 60 * 24 * 7
const MAX_CONCURRENT_REQUESTS = 6

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

export const COPTIC_IO_CACHE_POLICY: CachePolicy = {
  freshMs: 6 * HOUR,
  staleMs: 7 * 24 * HOUR,
  negativeMs: MINUTE,
  failureThreshold: 3,
  cooldownMs: 30 * 1000,
  maxEntries: 1000,
}

/** Per server instance; Next's data cache is the shared layer underneath. */
export const copticIoCache = new UpstreamCache(COPTIC_IO_CACHE_POLICY)

export function copticIoBaseUrl(): string {
  const configured = process.env.COPTIC_IO_API_URL?.trim()
  return (configured || COPTIC_IO_DEFAULT_BASE_URL).replace(/\/+$/, '')
}

// ── Upstream response schemas (loose: unknown keys are ignored) ─────────────

const copticDateSchema = z.object({
  day: z.number(),
  month: z.number(),
  year: z.number(),
  monthString: z.string(),
})

const celebrationSchema = z.object({
  name: z.string(),
  category: z.string().optional(),
  type: z.string().optional(),
})

const fastingSchema = z.object({
  isFasting: z.boolean(),
  fastType: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
})

const seasonSchema = z.object({
  season: z.string(),
  description: z.string().nullable().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

const synaxariumEntrySchema = z.object({
  name: z.string().optional(),
  text: z.string().optional(),
})

const readingsSummarySchema = z.object({
  reference: z.record(z.string(), z.unknown()).optional(),
  Synaxarium: z.array(synaxariumEntrySchema).optional(),
  season: z.string().optional(),
  seasonDay: z.string().optional(),
  fullDate: copticDateSchema.optional(),
})

const passageSchema = z.object({
  bookName: z.string(),
  chapters: z.array(
    z.object({
      chapterNum: z.number(),
      verses: z.array(z.object({ num: z.number(), text: z.string() })),
    })
  ),
})

const passagesSchema = z.array(passageSchema).nullable().optional()

const readingsDetailedSchema = readingsSummarySchema.extend({
  VPsalm: passagesSchema,
  VGospel: passagesSchema,
  Prophecies: passagesSchema,
  MPsalm: passagesSchema,
  MGospel: passagesSchema,
  Pauline: passagesSchema,
  Catholic: passagesSchema,
  Acts: passagesSchema,
  LPsalm: passagesSchema,
  LGospel: passagesSchema,
  EPPsalm: passagesSchema,
  EPGospel: passagesSchema,
})

const calendarMonthSchema = z.object({
  days: z.array(
    z.object({
      gregorianDate: z.string(),
      copticDate: copticDateSchema,
      fasting: fastingSchema,
    })
  ),
})

// ── Transport ───────────────────────────────────────────────────────────────

function copticIoGet<T>(
  path: string,
  schema: z.ZodType<T>,
  params: Record<string, string> = {}
): Promise<T | null> {
  const url = new URL(`${copticIoBaseUrl()}${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  // One circuit per endpoint ("/api/celebrations", "/api/calendar", ...), so
  // the calendar's fan-out failing can't take down the Today card.
  const endpoint = url.pathname.split('/').slice(0, 3).join('/')
  return copticIoCache.get(url.toString(), () => fetchCopticIo(url, schema), endpoint)
}

async function fetchCopticIo<T>(url: URL, schema: z.ZodType<T>): Promise<LoadOutcome<T | null>> {
  try {
    const response = await fetch(url, {
      // identity: Coptic IO's edge cache can return compressed bytes Node won't
      // decode (see lib/coptic-io-body.ts). Headers are part of Next's fetch
      // cache key, so this also leaves any such bodies cached earlier behind.
      headers: { Accept: 'application/json', 'Accept-Encoding': 'identity' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS, tags: ['coptic-io'] },
    })
    // 404 is the API's answer for "nothing on this day" (e.g. no Synaxarium):
    // a real answer, cached like any other.
    if (response.status === 404) return { ok: true, value: null }
    if (!response.ok) {
      console.warn(`Coptic IO ${url.pathname} responded ${response.status}`)
      return { ok: false }
    }
    const body = parseJsonBody(new Uint8Array(await response.arrayBuffer()))
    if (body === undefined) {
      const encoding = response.headers.get('content-encoding') ?? 'none'
      console.warn(`Coptic IO ${url.pathname} returned a body that isn't JSON (content-encoding: ${encoding})`)
      return { ok: false }
    }
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      console.warn(`Coptic IO ${url.pathname} returned an unexpected shape`)
      return { ok: false }
    }
    return { ok: true, value: parsed.data }
  } catch (error: unknown) {
    console.warn(`Coptic IO ${url.pathname} failed:`, error instanceof Error ? error.message : error)
    return { ok: false }
  }
}

/** Run `task` over `items` with at most `limit` in flight, preserving order. */
async function mapWithLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

// ── Normalizers (exported for tests) ────────────────────────────────────────

export function toCopticDateInfo(value: z.infer<typeof copticDateSchema> | null | undefined): CopticDateInfo | null {
  if (!value) return null
  return {
    day: value.day,
    month: value.month,
    year: value.year,
    monthName: value.monthString,
    label: formatCopticDate(value.day, value.monthString, value.year),
  }
}

export function toFeasts(celebrations: z.infer<typeof celebrationSchema>[] | null | undefined): LiturgicalFeast[] {
  if (!celebrations) return []
  return sortFeasts(
    celebrations.map((celebration) => ({
      name: celebration.name.trim(),
      category: parseFeastCategory(celebration.category, celebration.type),
    }))
  )
}

export function toFast(fasting: z.infer<typeof fastingSchema> | null | undefined): LiturgicalFast | null {
  if (!fasting?.isFasting) return null
  return { name: fasting.description?.trim() || 'Fasting day', type: fasting.fastType ?? null }
}

export function toReadingReferences(reference: Record<string, unknown> | undefined): ReadingReference[] {
  if (!reference) return []
  const readings: ReadingReference[] = []
  for (const key of READING_KEYS) {
    const value = reference[key]
    if (typeof value !== 'string' || !value.trim()) continue
    readings.push({
      key,
      ...READING_DEFINITIONS[key],
      // The API joins multi-part readings with ";" and no space.
      reference: value.split(';').map((part) => part.trim()).filter(Boolean).join('; '),
    })
  }
  return readings
}

export function toReadingSections(data: z.infer<typeof readingsDetailedSchema>): ReadingSection[] {
  const sections: ReadingSection[] = []
  for (const key of READING_KEYS) {
    const passages = data[key]
    if (!passages || passages.length === 0) continue
    sections.push({
      key,
      ...READING_DEFINITIONS[key],
      passages: passages.map((passage) => {
        const chapters = passage.chapters.map((chapter) => ({ chapter: chapter.chapterNum, verses: chapter.verses }))
        return {
          bookName: passage.bookName,
          reference: formatPassageReference(passage.bookName, chapters),
          chapters,
        }
      }),
    })
  }
  return sections
}

function toSeason(value: z.infer<typeof seasonSchema> | null): LiturgicalSeason | null {
  if (!value?.season) return null
  return {
    name: value.season,
    description: value.description ?? null,
    startDate: value.startDate ?? null,
    endDate: value.endDate ?? null,
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/** A summary of one church day: Coptic date, season, fast, feasts, saints and reading references. */
export async function getLiturgicalDay(date: string, language: LiturgicalLanguage = 'en'): Promise<LiturgicalDay> {
  const lang = { lang: language }
  const [readings, fasting, celebrations, season] = await Promise.all([
    copticIoGet(`/api/readings/${date}`, readingsSummarySchema, lang),
    copticIoGet(`/api/fasting/${date}`, fastingSchema, lang),
    copticIoGet(`/api/celebrations/${date}`, z.array(celebrationSchema).nullable(), lang),
    copticIoGet(`/api/season/${date}`, seasonSchema, lang),
  ])

  return {
    date,
    language,
    copticDate: toCopticDateInfo(readings?.fullDate),
    season: toSeason(season),
    seasonDay: readings?.seasonDay ?? null,
    fasting: fasting ? { fast: toFast(fasting) } : null,
    feasts: toFeasts(celebrations),
    saints: (readings?.Synaxarium ?? [])
      .map((entry) => entry.name?.trim())
      .filter((name): name is string => Boolean(name))
      .map((name) => ({ name })),
    readings: toReadingReferences(readings?.reference),
    available: Boolean(readings || fasting || celebrations || season),
  }
}

/** The full Katameros for a day, with verse text and Synaxarium stories. Null if Coptic IO is unavailable. */
export async function getDailyReadings(date: string, language: LiturgicalLanguage = 'en'): Promise<DailyReadings | null> {
  const data = await copticIoGet(`/api/readings/${date}`, readingsDetailedSchema, {
    detailed: 'true',
    lang: language,
  })
  if (!data) return null
  return {
    date,
    language,
    copticDate: toCopticDateInfo(data.fullDate),
    season: data.season ?? null,
    seasonDay: data.seasonDay ?? null,
    sections: toReadingSections(data),
    synaxarium: (data.Synaxarium ?? [])
      .filter((entry) => entry.name?.trim())
      .map((entry) => ({ name: entry.name!.trim(), text: entry.text?.trim() || null })),
  }
}

/**
 * Coptic date, fast and feasts for each requested day (e.g. every Sunday on a
 * lesson schedule). Uses one month view per month plus one celebrations call
 * per day, all cached. Days Coptic IO could not answer are omitted.
 */
export async function getLiturgicalCalendar(dates: string[]): Promise<Record<string, LiturgicalCalendarDay>> {
  const unique = Array.from(new Set(dates)).sort()
  const months = Array.from(new Set(unique.map((date) => date.slice(0, 7))))

  const [monthViews, celebrations] = await Promise.all([
    mapWithLimit(months, MAX_CONCURRENT_REQUESTS, (month) => {
      const [year, monthNumber] = month.split('-')
      return copticIoGet(`/api/calendar/month/${year}/${Number(monthNumber)}`, calendarMonthSchema)
    }),
    mapWithLimit(unique, MAX_CONCURRENT_REQUESTS, (date) =>
      copticIoGet(`/api/celebrations/${date}`, z.array(celebrationSchema).nullable())
    ),
  ])

  const monthDays = new Map<string, z.infer<typeof calendarMonthSchema>['days'][number]>()
  for (const view of monthViews) {
    for (const day of view?.days ?? []) monthDays.set(day.gregorianDate, day)
  }

  const result: Record<string, LiturgicalCalendarDay> = {}
  unique.forEach((date, index) => {
    const day = monthDays.get(date)
    const feasts = toFeasts(celebrations[index])
    if (!day && feasts.length === 0) return
    result[date] = {
      date,
      copticDate: toCopticDateInfo(day?.copticDate),
      fast: toFast(day?.fasting),
      feasts,
    }
  })
  return result
}

/**
 * Browser cache lifetime for a liturgical response.
 * - Incomplete answers (Coptic IO partly down): never cached, so the next view retries.
 * - "Today" (no date asked for): until midnight at the church, when it stops being today.
 * - A pinned date: a day, then served stale for a week while revalidating.
 */
export function liturgicalCacheControl({ complete, pinnedDate }: { complete: boolean; pinnedDate: boolean }): string {
  if (!complete) return 'no-store'
  if (!pinnedDate) return `private, max-age=${secondsUntilChurchMidnight()}`
  return 'private, max-age=86400, stale-while-revalidate=604800'
}
