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
Lord in gold), the church season (Annual Days, Advent, Holy 50s, …), the fast
(or "No fast today"), what the day is within its cycle ("Monday of the third
week of Great Lent", "2nd Sunday of Baba"), the day's Gospel (linking to the
readings page) and the saints commemorated. On a day whose readings Coptic IO
doesn't have (see [Reading cycles and seasons](#reading-cycles-and-seasons)),
the Gospel line says so instead.

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
| `lib/liturgical-cycle.ts` | Client-safe. Coptic date and Coptic Easter arithmetic, the church season, and which Katameros cycle a day reads from. No I/O. |
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
| SWR | each browser tab | the session | No refetch while navigating. "Today" is passed as an explicit date from `useChurchToday()`, which rolls over at church midnight, so an open tab moves to the new day by itself. Every request carries `v=LITURGICAL_API_VERSION` (`lib/liturgical.ts`); bump it when what a response means changes, so browsers skip answers cached under the old meaning. |
| HTTP `Cache-Control` | each browser and phone | pinned date: 1 hour; "today": 1 hour or until church midnight, whichever is sooner; partial/failed answers: `no-store` | Reloads and new tabs skip the server. Kept short because our own season and cycle logic is part of every answer, so a fix must reach clients within the hour. A failure is never pinned in the browser. |
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
| `GET /api/celebrations/upcoming/list?days=365&from=` | A year of upcoming feasts in one call, for lesson schedules and calendars. Only dates outside that window are looked up one day at a time (2 at once), because Coptic IO rate-limits (429) a per-day fan-out. `from` isn't read by the API; it keys our cache by day. |
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

## Reading cycles and seasons

Reported by Mina Beshy (SMM-117): the site showed the readings for **8 Baba**
on Sunday 18 October 2026, which is the **2nd Sunday of Baba**, and called
annual days "ordinary".

### Root cause: upstream, in Coptic IO

Both problems come from Coptic IO, not from our mapping, caching or rendering.
Checked against its source (`apps/api/src/models/readings/index.ts`, commit
`b65e2b2`, 14 October 2026) by running its own reading selector:

- **Readings.** Coptic IO picks a day's readings in two steps: a moveable
  override keyed by days from the Coptic Easter, which exists **only** for Great
  Lent (−57…−7, from the preparation Saturday through Palm Sunday) and Jonah's
  Fast (−69…−66), and otherwise the annual Katameros by Coptic month and day.
  It has **no Sunday Katameros, no Pascha (Holy Week, Monday–Saturday) readings
  and no Holy 50s readings**. On those days it returns the annual readings for
  the Coptic date: 8 Baba on the 2nd Sunday of Baba, 24 Baramouda on the Feast
  of the Resurrection 2027, and so on.
- **Seasons.** Its season endpoint knows six seasons (Nineveh, Great Lent, Holy
  Week, Paschal Season, Apostles' Fast, Nativity Fast) and answers **"Ordinary
  Time"** for every other day. It also runs the Apostles' Fast through the Feast
  of the Apostles itself (12 July) instead of ending on its eve.

Date handling was not at fault. We always send an explicit church-local date
(`America/New_York`), and our Coptic date and Easter arithmetic agree with Coptic
IO's own on every day from 1900 to 2199. Caching was not at fault either,
because the cycle is computed on every request after the cache (below).

### What the app does

`lib/liturgical-cycle.ts` works out, from the date alone:

- **The season**, in the taxonomy the church asked for: Annual Days, Festive
  Days, Advent, Nativity Paramoun, Nativity Feast/Period, Theophany Paramoun,
  Theophany Feast/Period, Jonah's Fast and Jonah's Passover, Great Lent, Holy
  Week, Holy 50s, Apostles' Fast, St. Mary's Fast. Overlaps resolve in that order
  of precedence: Holy Week, Great Lent, Holy 50s, Jonah, the Apostles' and
  St. Mary's Fasts, the Nativity and Theophany cycle, Festive Days, then Annual
  Days. It replaces Coptic IO's season everywhere, so `/api/season` is no longer
  called. Names come back in Arabic for `lang=ar`.
- **The reading cycle**, with this precedence: the Holy 50s (Resurrection to
  Pentecost), the Pascha book (Monday to Saturday of Holy Week), Great Lent
  (preparation Saturday to Palm Sunday), Jonah's Fast and Passover, the fixed
  feasts of the Lord (whose own readings outrank a Sunday), Sundays (the *n*th
  Sunday of the Coptic month), and otherwise the annual day.

When the cycle is one Coptic IO doesn't have (`readingCycle.available: false`):

| Surface | Behaviour |
|---|---|
| `/api/liturgical/day` | `readings` is empty; `readingCycle` and `seasonDay` say what the day is ("2nd Sunday of Baba") |
| `/api/liturgical/readings` | `sections` is empty; Coptic IO's annual readings move to `annualSections`, labelled with `readingCycle.annualDay` |
| Today card | "Today's readings aren't available yet." instead of the annual Gospel |
| Readings page | Explains which book is missing; the annual readings for the Coptic date stay one click away, clearly labelled as not the day's |

The Synaxarium is shown on every day, because it follows the Coptic date and
is correct. The cycle is computed per request from the date, after Coptic IO's
answer is read from cache, so a cached response can't carry a wrong cycle.
Clients keep an answer for an hour at most, and the web app's `v` parameter
skips answers cached before this change (which were cached for a day plus a
week of stale-while-revalidate: why "Ordinary Time" lingered after the first
deploy). The UI also tolerates the older response shape.

### Labels and sources

- **Annual Days** is the Church's own term for the days outside the seasons:
  Katameros indexes are organised as "Seasons, Annual Days, Sundays, Kiahk"
  ([St. Bishoy, Ottawa](https://saintbishoy.ca/deacons-corner/katameros/)).
  The hymn tunes follow the same lines: annual (*sanawi*), festive (*farayhi*),
  Kiahk (*kiahki*), fasting (*siyami*), sorrowful (*hazayni*, Holy Week) and
  Palm (*sha'anini*, Palm Sunday and the Feasts of the Cross).
- **Advent · Kiahk.** Advent (the Nativity Fast) begins on 16 Hator; the Kiahk
  praises and tune run from 1 Kiahk until the Nativity Paramoun, so those days
  are labelled "Advent · Kiahk" (still the `advent` key).
- **The Katameros** has separate books for Sundays, weekdays, Great Lent, Holy
  Week (Pascha) and the Fifty Days, which is how `ReadingCycleKind` is split.
  Within the Holy 50s, a fixed feast falling on a Sunday yields to the Sunday
  readings of the Fifty Days, consistent with the Holy 50s outranking feasts.

### Assumptions to confirm with the church

These rules come from common Coptic practice and are covered by tests. Confirm
them with Mina before treating them as final:

- **Paramoun.** It is the eve of the Nativity or Theophany. Abstinence isn't
  kept on Saturdays or Sundays, so when the eve falls on a weekend the Paramoun
  starts on the Friday before: a Monday feast gets Friday to Sunday, a Sunday
  feast Friday and Saturday. Church sources agree on the Monday case; at least
  one describes a Sunday feast as a Saturday–Sunday Paramoun, so confirm that
  one. Coptic IO's own static data instead marks a fixed 26–28 Kiahk and
  8–10 Toba.
- **Nativity Period** runs from 29 Kiahk to the Theophany Paramoun. **Theophany
  Period** runs from 11 Toba through the Wedding at Cana (13 Toba). Sources
  differ on which tune the Nativity uses (festive or Kiahk), so the ends of both
  periods are the least certain labels here.
- **Festive Days** are 1–19 Tout (Nayrouz through the Feast of the Cross), the
  29th of each month except Toba and Amshir, and the fixed feasts of the Lord,
  each only when no fast or season outranks it. The church described Festive
  Days as a catch-all that may be subdivided later.
- **Great Lent's preparation weekend.** The two days before the fast begins read
  from the Lenten Katameros but are labelled with the season they fall in.
- **Feasts of the Lord on a Sunday** keep their own readings: Nayrouz, the Cross
  (17 Tout and 10 Baramhat), 28–29 Kiahk, 6, 10, 11 and 13 Toba, 8 Amshir,
  29 Baramhat, 24 Bashans and 13 Mesra.

### Remaining upstream limitation

Until Coptic IO adds the Sunday Katameros, the Pascha readings and the Holy 50s
Katameros, the app can say what those days are but cannot show their readings.
We don't carry our own copy of those tables, so that no unreviewed Scripture
references go out as the Church's. Worth reporting upstream. When Coptic IO
adds a cycle, add its kind to `UPSTREAM_CYCLES` in `lib/liturgical-cycle.ts`
(and, if it's moveable, line up the offsets with its tables).

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
