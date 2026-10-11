# Coptic IO integration — the church calendar

The app shows the Coptic Orthodox calendar — Coptic date, season, fasts, feasts,
the Katameros readings and the Synaxarium — from
[Coptic IO](https://coptic.io), an open-source (MIT) API maintained at
[github.com/abanobmikaeel/coptic.io](https://github.com/abanobmikaeel/coptic.io).

It is **reference content shared by both modes**. It carries no user data,
confers no authority, and is never consulted by a permission check. Nothing in
it couples Servants Prep to Sunday School.

## What each person gets

| Who | Where | What |
|---|---|---|
| Admins, priests, prep servants | `/dashboard/admin` | "Today in the Church" card beside *Next 14 days*; feasts as chips on the month calendar and in *Next 14 days*, fast days marked |
| Admins, curriculum editors | `/dashboard/admin/curriculum` | Feast and fast tags on every **upcoming** lesson date, so a meeting isn't planned on the Nativity or in Holy Week by accident |
| Mentors | `/dashboard/mentor` | "Today in the Church" card |
| Students | `/dashboard/student` | "Today in the Church" card in the side column |
| Sunday School servants and coordinators | `/dashboard/servants` | "Today in the Church" card, the coming Sunday's feast/fast under *This Sunday*, and feasts and fast days on the month calendar |
| Sunday School servants | `/dashboard/servants/lessons` | Feast and fast tags under each Sunday, so lessons can follow the Church's year |
| Parents | `/dashboard/parent` | "Today in the Church" card — the day's saints are a ready-made family conversation |
| Everyone | `/dashboard/readings` ("Church → Daily readings" in the nav) | The full Katameros with verse text (English NKJV or Arabic, right-to-left), grouped by Vespers / Matins / Liturgy / Evening, and the Synaxarium stories; any date |

Feast chips link to that day's readings (`/dashboard/readings?date=…`). Fast
days carry a small "Fast" tag in the corner of the day (full name on hover and
in the cell's accessible label) rather than a chip, so the Nativity Fast's 43
days, or every Wednesday and Friday, don't crowd lessons out of the cell.

### Subscribing in your own calendar

Coptic IO publishes a live iCalendar feed of feasts, fasting periods and
season starts (last year through two years ahead; calendar apps refresh it
daily):

```
https://api.coptic.io/api/calendar/ical/subscribe
```

The **Subscribe** menu (`components/liturgical/calendar-subscribe-button.tsx`)
offers it as a `webcal://` link (Apple Calendar, Outlook app, phones), a
Google Calendar link, an Outlook.com link, and "Copy calendar link". It sits on
both dashboard calendars, the readings page, and the footer of the "Today in the
Church" card, so mentors, students and parents, who have no in-app calendar,
get it too. The subscription is between the person's calendar app and Coptic
IO directly; this app neither proxies nor sees it. The weekly Wednesday and
Friday fasts are not in the feed (only named fasting periods), whereas the
in-app calendar does mark them.

The "Today in the Church" card shows: Coptic date (A.M.), feasts (feasts of the
Lord in gold), liturgical season, the fast (or "No fast today"), the Lenten day
when there is one, the day's Gospel (linking to the readings page) and the
saints commemorated.

## Architecture

```
browser ──SWR──▶ /api/liturgical/{day,readings,calendar}   (requireAuth, validate dates)
                         │
                         ▼
                  lib/coptic-io.ts   (server: fetch + zod + timeout)
                         │  lib/coptic-io-cache.ts: memory, coalescing, stale-if-error, circuit breaker
                         │  Next data cache: shared, 7 days, 200s only
                         │  only YYYY-MM-DD and lang leave the app
                         ▼
                  https://api.coptic.io   (Cloudflare Worker, 12h edge cache)
```

| File | Role |
|---|---|
| `lib/liturgical.ts` | Client-safe types, Katameros section labels/order, feast ranking, date-key helpers. No I/O. |
| `lib/coptic-io.ts` | Server-only client. Imported by API routes only. |
| `app/api/liturgical/day` | One day's summary. `?date=YYYY-MM-DD&lang=en\|ar`; date defaults to **today at the church** (`America/New_York`), never the server's or Coptic IO's clock. |
| `app/api/liturgical/readings` | Full Katameros + Synaxarium text. 503 when Coptic IO is unreachable. |
| `app/api/liturgical/calendar` | `?dates=a,b,c` (≤ 60): Coptic date, fast and feasts per day, for lesson schedules. |
| `lib/swr.ts` | `useLiturgicalDay`, `useDailyReadings`, `useLiturgicalCalendar` (chunks >60 dates). |
| `components/liturgical/` | `TodayInChurch` card, `LiturgicalDateTags`, `CalendarSubscribeButton`, and `useLiturgicalCalendarOverlay` (feast chips + fast markers for `MonthCalendar`). |

The routes live under `app/api/liturgical/`, deliberately **not** under
`app/api/sunday-school/`, to stay out of that directory's naming collision.

### Why proxy instead of calling Coptic IO from the browser

- **Resilience.** Every upstream call has a 5 s timeout and resolves to `null`
  on any failure, non-2xx, or unexpected shape. The card renders "The church
  calendar is unavailable right now." and nothing else on the page is affected.
- **Validation.** Responses are parsed with zod before use; the API is a third
  party and its schema can drift.
- **Caching.** See [Caching](#caching) below.
- **Correct "today".** Coptic IO's own "today" is the Cloudflare edge's UTC
  clock. We always send an explicit church-local date.
- **Privacy.** Only calendar dates and a language code go upstream — no user,
  child, guardian or session data, and no cookies.
- **Text is rendered as text.** Synaxarium and Scripture are rendered as React
  text nodes, never `dangerouslySetInnerHTML`.

## Caching

Answers for an explicit date never change (until Coptic IO corrects its
data), and "today" only changes at midnight at the church. The cache layers
are built on that:

| Layer | Where | Lifetime | What it adds |
|---|---|---|---|
| SWR | each browser tab | the session | No refetch while navigating. "Today" is passed as an explicit date from `useChurchToday()`, which rolls over at church midnight, so an open tab moves to the new day by itself. |
| HTTP `Cache-Control` | each browser | pinned date: 1 day + 7 days stale-while-revalidate; "today": until church midnight; partial/failed answers: `no-store` | Reloads and new tabs skip the server. A failure is never pinned in the browser. |
| `UpstreamCache` (`lib/coptic-io-cache.ts`) | each server instance | fresh 6 h, then stale up to 7 days | Parsed values in memory; concurrent identical calls share one request; a failed reload serves the last good value (stale-if-error); a failure with no fallback is remembered for 60 s (negative cache); 3 failures in a row on one endpoint open that endpoint's circuit for 30 s (circuits are per endpoint, so the calendar's fan-out failing can't blank the Today card) so an outage costs one 5 s timeout instead of one per request; LRU-bounded at 1,000 entries. |
| Next data cache (`fetch` `next.revalidate`) | shared across instances and deploys (Vercel) | 7 days, stale-while-revalidate, tag `coptic-io` | Cold instances start warm. Next stores only 200 responses, so an outage is never cached. |
| Coptic IO edge | Cloudflare | 12 h | Their side; nothing to configure. |

"Nothing on this day" (a 404, e.g. no Synaxarium entry) is a real answer and is
cached like one; only network errors, timeouts, non-404 errors and unexpected
shapes count as failures.

To force fresh data everywhere (e.g. after Coptic IO fixes a reading), call
`revalidateTag('coptic-io')` from a server action or route; instance memory
catches up within 6 hours or on the next deploy.

### Upstream endpoints used

| Coptic IO endpoint | Used for |
|---|---|
| `GET /api/readings/:date?lang=` | Coptic date, reading references, Synaxarium names, Lenten day |
| `GET /api/readings/:date?detailed=true&lang=` | Full verse text and Synaxarium stories |
| `GET /api/fasting/:date?lang=` | Fast name and type |
| `GET /api/celebrations/:date?lang=` | Feasts, including moveable ones (the readings endpoint only has fixed ones) |
| `GET /api/season/:date?lang=` | Liturgical season |
| `GET /api/calendar/month/:year/:month` | Coptic date + fasting for a whole month (lesson schedules) |

Not published to npm: `@coptic/client` and `@coptic/core` are workspace
packages in the Coptic IO monorepo, and the client's paths have drifted from
the API's routes, so we call the REST API directly.

### Compressed bodies from Coptic IO's edge cache

Coptic IO's Cloudflare edge cache can serve a cached `200` whose body is still
compressed (gzip/brotli) with no `Content-Encoding` Node will act on. Browsers
cope, so their own site doesn't notice; Node's `fetch` hands back raw bytes and
every `JSON.parse` fails (logged as `Unexpected token … is not valid JSON`).
We therefore send `Accept-Encoding: identity`, and `lib/coptic-io-body.ts`
decompresses anything that still arrives compressed before parsing. Because
request headers are part of Next's fetch cache key, the identity header also
leaves behind any undecodable bodies cached before the fix. Worth reporting
upstream: `apps/api/src/middleware/cache.ts` re-serves `caches.default.match()`
responses as-is.

## Configuration

| Var | Purpose |
|---|---|
| `COPTIC_IO_API_URL` | Optional. Defaults to `https://api.coptic.io`. Point it at a local `wrangler dev` / self-hosted instance if needed. |

No API key is required.

## Known limits (from Coptic IO's own `docs/COVERAGE.md`)

- Katameros readings: complete daily cycle (en, ar, es, cop). Synaxarium: complete
  daily cycle in English and Arabic. These are what the app uses.
- English Scripture is the NKJV; the readings page credits Coptic IO and the
  translation.
- Agpeya, Tasbeha, incense and the Liturgy text exist upstream but are
  incomplete (the Liturgy especially), so they are not surfaced yet.

## Ideas not built yet

- **Agpeya hour of the day** card for students (`/api/agpeya/:hour`) once its
  English prose gaps close.
- **Feast reminders** via the existing web-push/cron plumbing (e.g. the evening
  before a feast of the Lord). Needs an opt-in so it never feels like spam.
- **Exam-section tie-ins**: link Synaxarium search results from the Church
  History section's lessons.
