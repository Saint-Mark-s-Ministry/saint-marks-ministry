import { afterEach, describe, expect, it, vi } from 'vitest'
import { distanceMeters, MEETING_RADIUS_METERS, meetingVenue, validMeetingPosition } from '@/lib/meeting-geofence'

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
  it('verifies the fixed church venue even when the geocoder is unavailable', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Geocoder unavailable'))
    vi.stubGlobal('fetch', fetcher)
    const venue = await meetingVenue()
    expect(venue).toEqual({ latitude: 40.71602, longitude: -74.08670 })
    expect(fetcher).not.toHaveBeenCalled()
    expect(await meetingVenue()).toEqual(venue)
  })

  it('accepts the church entrance and keeps the 150-meter boundary', async () => {
    const venue = await meetingVenue()
    // Independently listed address point is within the same church footprint.
    expect(distanceMeters(venue, { latitude: 40.715914, longitude: -74.086587 }))
      .toBeLessThan(MEETING_RADIUS_METERS)
    expect(distanceMeters(venue, { ...venue, latitude: venue.latitude + 0.001 }))
      .toBeLessThan(MEETING_RADIUS_METERS)
    expect(distanceMeters(venue, { ...venue, latitude: venue.latitude + 0.002 }))
      .toBeGreaterThan(MEETING_RADIUS_METERS)
  })
})
