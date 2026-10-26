import { brotliCompressSync, gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDaysToDateKey } from '@/lib/liturgical'
import {
  copticIoBaseUrl,
  copticIoCache,
  liturgicalCacheControl,
  getDailyReadings,
  getLiturgicalCalendar,
  getLiturgicalDay,
  toReadingReferences,
} from '@/lib/coptic-io'

const copticDate = { dateString: '1 Paopi', day: 1, month: 2, year: 1743, monthString: 'Paopi' }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function route(handlers: Record<string, () => Response | Promise<Response>>) {
  return vi.fn(async (input: URL | string) => {
    const url = new URL(String(input))
    const handler = Object.entries(handlers).find(([prefix]) => url.pathname.startsWith(prefix))?.[1]
    if (!handler) return json({ error: 'Not Found' }, 404)
    return handler()
  })
}

describe('Coptic IO client', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    copticIoCache.clear()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    fetchMock.mockReset()
  })

  it('uses the public API unless COPTIC_IO_API_URL overrides it', () => {
    expect(copticIoBaseUrl()).toBe('https://api.coptic.io')
    vi.stubEnv('COPTIC_IO_API_URL', 'http://localhost:8787/')
    expect(copticIoBaseUrl()).toBe('http://localhost:8787')
  })

  it('summarizes a day from readings, fasting, celebrations and season', async () => {
    fetchMock.mockImplementation(
      route({
        '/api/readings/': () =>
          json({
            reference: { id: 7, LGospel: 'Luke 4:1-13', Pauline: 'Romans 1:1-5;Romans 2:1', VPsalm: '' },
            Synaxarium: [{ name: 'Martyrdom of St. Mark' }, { name: '  ' }],
            fullDate: copticDate,
          }),
        '/api/fasting/': () => json({ isFasting: true, fastType: 'fast', description: 'Wednesday Fast' }),
        '/api/celebrations/': () =>
          json([
            { id: 1, name: 'Monthly Virgin', type: 'feast', category: 'commemoration' },
            { id: 2, name: 'Feast of the Cross', type: 'feast', category: 'otherFeast' },
          ]),
      })
    )

    // A Wednesday: the annual cycle, which Coptic IO has.
    const day = await getLiturgicalDay('2026-10-14', 'ar')

    expect(day).toMatchObject({
      date: '2026-10-14',
      language: 'ar',
      available: true,
      copticDate: { label: '1 Paopi 1743 A.M.' },
      season: { key: 'annual', name: 'الأيام السنوية' },
      seasonDay: null,
      readingCycle: { kind: 'annual', available: true },
      fasting: { fast: { name: 'Wednesday Fast', type: 'fast' } },
      saints: [{ name: 'Martyrdom of St. Mark' }],
    })
    expect(day.feasts.map((feast) => feast.name)).toEqual(['Feast of the Cross', 'Monthly Virgin'])
    expect(day.readings.map((reading) => [reading.key, reading.reference])).toEqual([
      ['Pauline', 'Romans 1:1-5; Romans 2:1'],
      ['LGospel', 'Luke 4:1-13'],
    ])

    // Only the date and language go upstream, always as an explicit date.
    for (const [input] of fetchMock.mock.calls) {
      const url = new URL(String(input))
      expect(url.origin).toBe('https://api.coptic.io')
      expect(url.pathname).toMatch(/\/2026-10-14$/)
      expect([...url.searchParams.keys()]).toEqual(['lang'])
    }
    // The season is computed here; Coptic IO's season endpoint ("Ordinary Time") is not asked.
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/season/'))).toBe(false)
  })

  it('withholds Coptic IO’s annual readings on the 2nd Sunday of Baba instead of showing them as the day’s', async () => {
    fetchMock.mockImplementation(
      route({
        '/api/readings/': () =>
          json({
            // What Coptic IO really returns for 2026-10-18: the annual readings for 8 Baba.
            reference: { id: 21, LGospel: 'Matthew 12:9-23' },
            Synaxarium: [{ name: 'St. Pelagia' }],
            fullDate: { day: 8, month: 2, year: 1743, monthString: 'Baba' },
          }),
      })
    )

    const day = await getLiturgicalDay('2026-10-18')
    expect(day).toMatchObject({
      copticDate: { label: '8 Baba 1743 A.M.' },
      season: { name: 'Annual Days' },
      seasonDay: '2nd Sunday of Baba',
      readingCycle: { kind: 'sunday', label: '2nd Sunday of Baba', annualDay: '8 Baba', available: false },
      readings: [],
      saints: [{ name: 'St. Pelagia' }],
      available: true,
    })
  })

  it('degrades instead of throwing when Coptic IO is down or misbehaves', async () => {
    fetchMock.mockImplementation(
      route({
        '/api/readings/': () => json({ error: 'boom' }, 500),
        '/api/fasting/': () => {
          throw new TypeError('fetch failed')
        },
        '/api/celebrations/': () => json('not an array'),
      })
    )

    const day = await getLiturgicalDay('2026-10-14')
    expect(day).toMatchObject({ available: false, copticDate: null, fasting: null, feasts: [], saints: [], readings: [] })
    // The season needs no network, so it is still right.
    expect(day.season.name).toBe('Annual Days')
    expect(await getDailyReadings('2026-10-14')).toBeNull()
  })

  it('distinguishes a known non-fasting day from unknown fasting status', async () => {
    fetchMock.mockImplementation(route({ '/api/fasting/': () => json({ isFasting: false, fastType: null, description: null }) }))
    expect((await getLiturgicalDay('2026-04-13')).fasting).toEqual({ fast: null })
  })

  it('returns full readings in Katameros order with built references', async () => {
    const passage = (bookName: string, chapterNum: number, nums: number[]) => [
      { bookName, chapters: [{ chapterNum, verses: nums.map((num) => ({ num, text: `v${num}` })) }] },
    ]
    fetchMock.mockImplementation(
      route({
        '/api/readings/': () =>
          json({
            LGospel: passage('Luke', 4, [1, 2, 3]),
            VPsalm: passage('Psalms', 96, [1]),
            Catholic: null,
            Synaxarium: [{ name: 'St. Mark', text: '  The story.  ' }, { name: 'St. Anianus' }],
            season: 'Great Lent',
            seasonDay: 'Monday of the third week of Great Lent',
            fullDate: copticDate,
          }),
      })
    )

    const readings = await getDailyReadings('2027-03-22')
    expect(readings?.sections.map((section) => [section.key, section.service, section.passages[0].reference])).toEqual([
      ['VPsalm', 'vespers', 'Psalms 96:1'],
      ['LGospel', 'liturgy', 'Luke 4:1-3'],
    ])
    expect(readings?.synaxarium).toEqual([
      { name: 'St. Mark', text: 'The story.' },
      { name: 'St. Anianus', text: null },
    ])
    expect(readings).toMatchObject({
      season: 'Great Lent',
      seasonDay: 'Monday of the third week of Great Lent',
      readingCycle: { kind: 'greatLent', available: true },
      annualSections: [],
    })
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('detailed')).toBe('true')
  })

  it('keeps annual readings apart on days whose cycle Coptic IO lacks, even when served from cache', async () => {
    const passage = [{ bookName: 'Matthew', chapters: [{ chapterNum: 12, verses: [{ num: 9, text: 'v9' }] }] }]
    fetchMock.mockImplementation(
      route({ '/api/readings/': () => json({ LGospel: passage, Synaxarium: [{ name: 'St. Mark', text: 'x' }], fullDate: copticDate }) })
    )

    for (const [date, kind, label] of [
      ['2026-10-18', 'sunday', '2nd Sunday of Baba'],
      ['2027-04-26', 'pascha', 'Monday of Holy Week'],
      ['2027-05-02', 'holy50', 'Feast of the Resurrection'],
      ['2027-05-13', 'holy50', 'Day 12 of the Holy 50s'],
    ] as const) {
      for (let pass = 0; pass < 2; pass++) {
        // The second pass is answered from the in-memory cache.
        const readings = await getDailyReadings(date)
        expect(readings, `${date} pass ${pass}`).toMatchObject({
          readingCycle: { kind, label, available: false },
          seasonDay: label,
          sections: [],
          synaxarium: [{ name: 'St. Mark', text: 'x' }],
        })
        expect(readings?.annualSections.map((section) => section.key)).toEqual(['LGospel'])
      }
    }

    // A cached weekday answer is still the day's own readings.
    for (let pass = 0; pass < 2; pass++) {
      const weekday = await getDailyReadings('2026-10-19')
      expect(weekday).toMatchObject({ readingCycle: { kind: 'annual', available: true }, annualSections: [] })
      expect(weekday?.sections.map((section) => section.key)).toEqual(['LGospel'])
    }
    const readingCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/readings/'))
    expect(readingCalls).toHaveLength(5)
  })

  it('builds calendar annotations from one month view per month and leaves out unknown days', async () => {
    fetchMock.mockImplementation(
      route({
        '/api/calendar/month/2026/10': () =>
          json({
            days: [
              { gregorianDate: '2026-10-11', copticDate, fasting: { isFasting: false, fastType: null, description: null } },
              { gregorianDate: '2026-10-14', copticDate, fasting: { isFasting: true, fastType: 'fast', description: 'Wednesday Fast' } },
            ],
          }),
        '/api/celebrations/2026-10-11': () => json([{ id: 3, name: 'Feast of St. Mark', category: 'otherFeast' }]),
        '/api/celebrations/': () => json(null),
      })
    )

    const days = await getLiturgicalCalendar(['2026-10-14', '2026-10-11', '2026-10-11', '2027-01-03'])
    expect(Object.keys(days).sort()).toEqual(['2026-10-11', '2026-10-14'])
    expect(days['2026-10-11']).toMatchObject({ fast: null, feasts: [{ name: 'Feast of St. Mark' }] })
    expect(days['2026-10-14']).toMatchObject({ fast: { name: 'Wednesday Fast' }, feasts: [] })

    const monthCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/calendar/month/'))
    expect(monthCalls.map(([input]) => new URL(String(input)).pathname).sort()).toEqual([
      '/api/calendar/month/2026/10',
      '/api/calendar/month/2027/1',
    ])
  })

  it('answers repeat requests from memory and caches "nothing on this day"', async () => {
    fetchMock.mockImplementation(route({ '/api/fasting/': () => json({ isFasting: false, fastType: null, description: null }) }))
    await getLiturgicalDay('2026-04-13')
    const calls = fetchMock.mock.calls.length
    await getLiturgicalDay('2026-04-13')
    expect(fetchMock.mock.calls.length).toBe(calls)
  })

  it('keeps serving the last good day when Coptic IO goes down', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-11T12:00:00Z'), toFake: ['Date'] })
    try {
      fetchMock.mockImplementation(route({ '/api/fasting/': () => json({ isFasting: true, fastType: 'fast', description: 'Wednesday Fast' }) }))
      await getLiturgicalDay('2026-10-14')

      vi.setSystemTime(new Date('2026-10-12T12:00:00Z')) // past the 6h freshness
      fetchMock.mockImplementation(async () => {
        throw new TypeError('fetch failed')
      })
      const day = await getLiturgicalDay('2026-10-14')
      expect(day.fasting).toEqual({ fast: { name: 'Wednesday Fast', type: 'fast' } })
      expect(day.available).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('caches pinned dates for a day, "today" until church midnight, and failures not at all', () => {
    expect(liturgicalCacheControl({ complete: false, pinnedDate: true })).toBe('no-store')
    expect(liturgicalCacheControl({ complete: true, pinnedDate: true })).toBe(
      'private, max-age=86400, stale-while-revalidate=604800'
    )
    const today = liturgicalCacheControl({ complete: true, pinnedDate: false })
    const maxAge = Number(/max-age=(\d+)/.exec(today)?.[1])
    expect(maxAge).toBeGreaterThanOrEqual(60)
    expect(maxAge).toBeLessThanOrEqual(86400)
  })

  it('reads bodies the Coptic IO edge cache serves still compressed, and asks for identity', async () => {
    const raw = (bytes: Buffer) => new Response(new Uint8Array(bytes), { status: 200 })
    fetchMock.mockImplementation(
      route({
        '/api/fasting/': () => raw(gzipSync(JSON.stringify({ isFasting: true, fastType: 'fast', description: 'Wednesday Fast' }))),
        '/api/readings/': () => raw(brotliCompressSync(JSON.stringify({ fullDate: copticDate }))),
      })
    )
    const day = await getLiturgicalDay('2026-10-14')
    expect(day.fasting).toEqual({ fast: { name: 'Wednesday Fast', type: 'fast' } })
    expect(day.copticDate?.label).toBe('1 Paopi 1743 A.M.')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).get('Accept-Encoding')).toBe('identity')
  })

  it('keeps the Today card working when the calendar endpoints fail', async () => {
    fetchMock.mockImplementation(
      route({
        '/api/calendar/': () => json({ error: 'boom' }, 500),
        '/api/celebrations/': () => json({ error: 'boom' }, 500),
        '/api/fasting/': () => json({ isFasting: false, fastType: null, description: null }),
      })
    )
    const dates = Array.from({ length: 10 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`)
    await getLiturgicalCalendar(dates)
    expect(copticIoCache.isCircuitOpen('/api/celebrations')).toBe(true)
    expect((await getLiturgicalDay('2026-10-20')).fasting).toEqual({ fast: null })
  })

  describe('calendar celebrations', () => {
    const monthView = (dates: string[]) =>
      json({
        days: dates.map((gregorianDate) => ({
          gregorianDate,
          copticDate,
          fasting: { isFasting: false, fastType: null, description: null },
        })),
      })

    beforeEach(() => {
      vi.useFakeTimers({ now: new Date('2026-10-11T12:00:00Z'), toFake: ['Date'] })
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('reads a year of upcoming feasts in one call instead of one per day', async () => {
      const sundays = Array.from({ length: 52 }, (_, i) => addDaysToDateKey('2026-10-18', i * 7))
      fetchMock.mockImplementation(async (input: URL | string) => {
        const url = new URL(String(input))
        if (url.pathname.startsWith('/api/calendar/month/')) {
          const [, , , , year, month] = url.pathname.split('/')
          return monthView(sundays.filter((day) => day.startsWith(`${year}-${month.padStart(2, '0')}`)))
        }
        if (url.pathname === '/api/celebrations/upcoming/list') {
          return json([{ date: '2027-01-10', copticDate, celebrations: [{ id: 1, name: 'Sunday after Nativity', category: 'otherFeast' }] }])
        }
        return json({ error: 'Too Many Requests' }, 429)
      })

      const days = await getLiturgicalCalendar(sundays)
      // 51 Sundays sit inside the one-call window; the 52nd (2027-10-10) is past
      // it, falls back to a per-day lookup, gets the 429 and is left out.
      expect(Object.keys(days)).toHaveLength(51)
      expect(days['2027-10-10']).toBeUndefined()
      expect(days['2026-10-18'].feasts).toEqual([])
      expect(days['2027-01-10'].feasts).toEqual([{ name: 'Sunday after Nativity', category: 'otherFeast' }])

      const paths = fetchMock.mock.calls.map(([input]) => new URL(String(input)))
      const celebrationCalls = paths.filter((url) => url.pathname.startsWith('/api/celebrations'))
      expect(celebrationCalls.map((url) => url.pathname)).toEqual([
        '/api/celebrations/upcoming/list',
        '/api/celebrations/2027-10-10',
      ])
      expect(celebrationCalls[0].searchParams.get('days')).toBe('365')
      expect(celebrationCalls[0].searchParams.get('from')).toBe('2026-10-11')
    })

    it('looks up days outside the window one at a time', async () => {
      fetchMock.mockImplementation(
        route({
          '/api/calendar/month/2026/9': () => monthView(['2026-09-27']),
          '/api/celebrations/2026-09-27': () => json([{ id: 2, name: 'Feast of the Cross', category: 'otherFeast' }]),
        })
      )
      const days = await getLiturgicalCalendar(['2026-09-27'])
      expect(days['2026-09-27'].feasts).toEqual([{ name: 'Feast of the Cross', category: 'otherFeast' }])
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('upcoming'))).toBe(false)
    })

    it('leaves out a day whose lookup failed, but keeps a day with no feasts', async () => {
      fetchMock.mockImplementation(
        route({
          '/api/calendar/month/2026/9': () => monthView(['2026-09-20', '2026-09-27']),
          '/api/celebrations/2026-09-20': () => json(null),
          '/api/celebrations/2026-09-27': () => json({ error: 'Too Many Requests' }, 429),
        })
      )
      const days = await getLiturgicalCalendar(['2026-09-20', '2026-09-27'])
      expect(days['2026-09-20']).toMatchObject({ feasts: [] })
      expect(days['2026-09-27']).toBeUndefined()
    })
  })

  it('ignores reference fields that are not Katameros readings', () => {
    expect(toReadingReferences({ id: 4, Day: '1 Paopi', LGospel: 'John 1:1-5' })).toEqual([
      { key: 'LGospel', label: 'Liturgy Gospel', service: 'liturgy', reference: 'John 1:1-5' },
    ])
  })
})
