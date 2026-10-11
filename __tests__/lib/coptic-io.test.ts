import { brotliCompressSync, gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
        '/api/season/': () => json({ date: '2026-10-11', season: 'Ordinary Time', isFasting: false }),
      })
    )

    const day = await getLiturgicalDay('2026-10-11', 'ar')

    expect(day).toMatchObject({
      date: '2026-10-11',
      language: 'ar',
      available: true,
      copticDate: { label: '1 Paopi 1743 A.M.' },
      season: { name: 'Ordinary Time' },
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
      expect(url.pathname).toMatch(/\/2026-10-11$/)
      expect([...url.searchParams.keys()]).toEqual(['lang'])
    }
  })

  it('degrades instead of throwing when Coptic IO is down or misbehaves', async () => {
    fetchMock.mockImplementation(
      route({
        '/api/readings/': () => json({ error: 'boom' }, 500),
        '/api/fasting/': () => {
          throw new TypeError('fetch failed')
        },
        '/api/celebrations/': () => json('not an array'),
        '/api/season/': () => json({ unexpected: true }),
      })
    )

    const day = await getLiturgicalDay('2026-10-11')
    expect(day).toMatchObject({ available: false, copticDate: null, season: null, fasting: null, feasts: [], saints: [], readings: [] })
    expect(await getDailyReadings('2026-10-11')).toBeNull()
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
            seasonDay: 'Week 1, Monday',
            fullDate: copticDate,
          }),
      })
    )

    const readings = await getDailyReadings('2026-10-11')
    expect(readings?.sections.map((section) => [section.key, section.service, section.passages[0].reference])).toEqual([
      ['VPsalm', 'vespers', 'Psalms 96:1'],
      ['LGospel', 'liturgy', 'Luke 4:1-3'],
    ])
    expect(readings?.synaxarium).toEqual([
      { name: 'St. Mark', text: 'The story.' },
      { name: 'St. Anianus', text: null },
    ])
    expect(readings?.seasonDay).toBe('Week 1, Monday')
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('detailed')).toBe('true')
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
        '/api/season/': () => raw(brotliCompressSync(JSON.stringify({ season: 'Ordinary Time' }))),
      })
    )
    const day = await getLiturgicalDay('2026-10-14')
    expect(day.fasting).toEqual({ fast: { name: 'Wednesday Fast', type: 'fast' } })
    expect(day.season?.name).toBe('Ordinary Time')
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

  it('ignores reference fields that are not Katameros readings', () => {
    expect(toReadingReferences({ id: 4, Day: '1 Paopi', LGospel: 'John 1:1-5' })).toEqual([
      { key: 'LGospel', label: 'Liturgy Gospel', service: 'liturgy', reference: 'John 1:1-5' },
    ])
  })
})
