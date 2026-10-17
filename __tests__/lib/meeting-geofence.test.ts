import { afterEach, describe, expect, it, vi } from 'vitest'
import { distanceMeters, meetingVenue, validMeetingPosition } from '@/lib/meeting-geofence'

afterEach(() => vi.unstubAllGlobals())
describe('meeting geofence', () => {
  const position = { latitude: 40.72, longitude: -74.09, accuracy: 10, timestamp: Date.now() }
  it('accepts fresh, precise positions and rejects stale, future, invalid or imprecise coordinates', () => {
    expect(validMeetingPosition(position, position.timestamp)).toBe(true)
    for (const bad of [{ latitude: 91 }, { longitude: -181 }, { accuracy: 101 }, { accuracy: -1 }, { latitude: NaN }, { timestamp: position.timestamp - 120001 }, { timestamp: position.timestamp + 10001 }]) {
      expect(validMeetingPosition({ ...position, ...bad }, position.timestamp)).toBe(false)
    }
  })
  it('measures distance without expanding the fence by reported uncertainty', () => {
    expect(distanceMeters(position, position)).toBe(0)
    expect(distanceMeters(position, { ...position, latitude: 40.721 })).toBeCloseTo(111.19, 1)
    expect(distanceMeters(position, { ...position, latitude: 40.722 })).toBeGreaterThan(150)
  })
  it('resolves only the configured address and rejects ambiguous results', async () => {
    const match = { matchedAddress: '427 WEST SIDE AVE, JERSEY CITY, NJ', addressComponents: { city: 'JERSEY CITY', state: 'NJ' }, coordinates: { x: -74.09, y: 40.72 } }
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: { addressMatches: [match] } }) })
    vi.stubGlobal('fetch', fetcher)
    expect(await meetingVenue()).toEqual({ latitude: 40.72, longitude: -74.09 })
    expect(String(fetcher.mock.calls[0][0])).toContain('427+West+Side+Ave')
    fetcher.mockResolvedValue({ ok: true, json: async () => ({ result: { addressMatches: [] } }) })
    await expect(meetingVenue()).rejects.toThrow('Venue lookup unavailable')
    fetcher.mockResolvedValue({ ok: true, json: async () => ({ result: { addressMatches: [{ ...match, matchedAddress: '429 WEST SIDE AVE' }] } }) })
    await expect(meetingVenue()).rejects.toThrow('Venue lookup unavailable')
  })
})
