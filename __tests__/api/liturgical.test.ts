import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  day: vi.fn(),
  readings: vi.fn(),
  calendar: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/coptic-io', async (importOriginal) => ({
  liturgicalCacheControl: (await importOriginal<typeof import('@/lib/coptic-io')>()).liturgicalCacheControl,
  getLiturgicalDay: mocks.day,
  getDailyReadings: mocks.readings,
  getLiturgicalCalendar: mocks.calendar,
}))

import { GET as getDay } from '@/app/api/liturgical/day/route'
import { GET as getReadings } from '@/app/api/liturgical/readings/route'
import { GET as getCalendar } from '@/app/api/liturgical/calendar/route'

const request = (path: string) => new NextRequest(`http://localhost${path}`)

describe('liturgical API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.auth.mockResolvedValue({ id: 'user', role: 'SERVANT' })
    mocks.day.mockImplementation(async (date: string, language: string) => ({ date, language, available: true }))
    mocks.readings.mockResolvedValue({ date: '2026-10-11', sections: [] })
    mocks.calendar.mockResolvedValue({})
  })

  it('requires a session on every route', async () => {
    mocks.auth.mockRejectedValue(new Error('Unauthorized'))
    for (const response of [
      await getDay(request('/api/liturgical/day')),
      await getReadings(request('/api/liturgical/readings')),
      await getCalendar(request('/api/liturgical/calendar?dates=2026-10-11')),
    ]) {
      expect(response.status).toBe(401)
    }
    expect(mocks.day).not.toHaveBeenCalled()
  })

  it('answers any signed-in role, defaulting to the church date and English', async () => {
    for (const role of ['STUDENT', 'PARENT', 'PRIEST']) {
      mocks.auth.mockResolvedValue({ id: 'user', role })
      const response = await getDay(request('/api/liturgical/day'))
      expect(response.status).toBe(200)
    }
    const [date, language] = mocks.day.mock.calls[0]
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(language).toBe('en')
  })

  it('passes an explicit date and Arabic through', async () => {
    await getDay(request('/api/liturgical/day?date=2027-01-07&lang=ar'))
    expect(mocks.day).toHaveBeenCalledWith('2027-01-07', 'ar')
  })

  it('rejects malformed dates before anything goes upstream', async () => {
    for (const bad of ['2026-02-30', '../../health', '2026-10-11T00:00']) {
      expect((await getDay(request(`/api/liturgical/day?date=${encodeURIComponent(bad)}`))).status).toBe(400)
      expect((await getReadings(request(`/api/liturgical/readings?date=${encodeURIComponent(bad)}`))).status).toBe(400)
    }
    expect((await getCalendar(request('/api/liturgical/calendar?dates=2026-10-11,nope'))).status).toBe(400)
    expect(mocks.day).not.toHaveBeenCalled()
    expect(mocks.readings).not.toHaveBeenCalled()
    expect(mocks.calendar).not.toHaveBeenCalled()
  })

  it('does not cache a day Coptic IO could not answer', async () => {
    mocks.day.mockResolvedValue({ available: false })
    const response = await getDay(request('/api/liturgical/day'))
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('caches a pinned date longer than "today"', async () => {
    const pinned = await getDay(request('/api/liturgical/day?date=2027-01-07'))
    expect(pinned.headers.get('Cache-Control')).toContain('max-age=86400')
    const today = await getDay(request('/api/liturgical/day'))
    expect(today.headers.get('Cache-Control')).toMatch(/^private, max-age=\d+$/)
  })

  it('does not cache a calendar with days missing', async () => {
    mocks.calendar.mockResolvedValue({ '2026-10-11': { date: '2026-10-11' } })
    const partial = await getCalendar(request('/api/liturgical/calendar?dates=2026-10-11,2026-10-18'))
    expect(partial.headers.get('Cache-Control')).toBe('no-store')
    const whole = await getCalendar(request('/api/liturgical/calendar?dates=2026-10-11'))
    expect(whole.headers.get('Cache-Control')).toContain('max-age=86400')
  })

  it('reports 503 when the readings are unavailable', async () => {
    mocks.readings.mockResolvedValue(null)
    expect((await getReadings(request('/api/liturgical/readings?date=2026-10-11'))).status).toBe(503)
  })

  it('caps and de-duplicates calendar dates', async () => {
    const many = Array.from({ length: 61 }, (_, i) => `2026-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`)
    expect((await getCalendar(request(`/api/liturgical/calendar?dates=${many.join(',')}`))).status).toBe(400)

    const response = await getCalendar(request('/api/liturgical/calendar?dates=2026-10-11,2026-10-11,2026-10-18'))
    expect(response.status).toBe(200)
    expect(mocks.calendar).toHaveBeenCalledWith(['2026-10-11', '2026-10-18'])

    const empty = await getCalendar(request('/api/liturgical/calendar'))
    expect(await empty.json()).toEqual({ days: {} })
  })
})
