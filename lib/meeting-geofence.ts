export const MEETING_ADDRESS = '427 Westside Ave, Jersey City, NJ'
export const MEETING_RADIUS_METERS = 150
export interface MeetingPosition { latitude: number; longitude: number; accuracy: number; timestamp: number }
export function validMeetingPosition(value: unknown, now = Date.now()): value is MeetingPosition {
  if (!value || typeof value !== 'object') return false
  const p = value as MeetingPosition
  return [p.latitude, p.longitude, p.accuracy, p.timestamp].every(v => typeof v === 'number' && Number.isFinite(v)) &&
    Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180 && p.accuracy > 0 && p.accuracy <= 100 &&
    p.timestamp <= now + 10_000 && now - p.timestamp <= 120_000
}
export function distanceMeters(a: Pick<MeetingPosition, 'latitude' | 'longitude'>, b: Pick<MeetingPosition, 'latitude' | 'longitude'>) {
  const radians = (n: number) => n * Math.PI / 180
  const h = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(radians(b.longitude - a.longitude) / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)))
}

/** Resolve the fixed venue on the server; never accept a venue supplied by a client. */
export async function meetingVenue(): Promise<{ latitude: number; longitude: number }> {
  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress')
  url.search = new URLSearchParams({ address: '427 West Side Ave, Jersey City, NJ', benchmark: 'Public_AR_Current', format: 'json' }).toString()
  const response = await fetch(url, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error('Venue lookup unavailable')
  const data = await response.json()
  const matches = data?.result?.addressMatches
  if (!Array.isArray(matches) || matches.length !== 1) throw new Error('Venue lookup unavailable')
  const match = matches[0]
  const address = match.addressComponents
  if (address?.city !== 'JERSEY CITY' || address?.state !== 'NJ' ||
      !/^427\s+WEST\s*SIDE\s+AVE\b/i.test(match.matchedAddress ?? '') ||
      !Number.isFinite(match.coordinates?.x) || !Number.isFinite(match.coordinates?.y)) throw new Error('Venue lookup unavailable')
  return { latitude: match.coordinates.y, longitude: match.coordinates.x }
}
