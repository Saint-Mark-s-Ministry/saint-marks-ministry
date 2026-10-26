import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LITURGICAL_API_VERSION } from '@/lib/liturgical'
import { useDailyReadings, useLiturgicalCalendar, useLiturgicalDay } from '@/lib/swr'

const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
)

describe('liturgical SWR hooks', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('version every request, so browsers skip answers cached under an older meaning (e.g. "Ordinary Time")', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({ days: {} }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useLiturgicalDay('2026-10-26'), { wrapper })
    renderHook(() => useDailyReadings('2026-10-26', 'ar'), { wrapper })
    renderHook(() => useLiturgicalCalendar(['2026-10-25']), { wrapper })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    const urls = fetchMock.mock.calls.map(([input]) => new URL(String(input), 'http://localhost'))
    expect(urls.map((url) => url.pathname).sort()).toEqual([
      '/api/liturgical/calendar',
      '/api/liturgical/day',
      '/api/liturgical/readings',
    ])
    for (const url of urls) expect(url.searchParams.get('v')).toBe(LITURGICAL_API_VERSION)
    expect(LITURGICAL_API_VERSION).not.toBe('1')
  })
})
