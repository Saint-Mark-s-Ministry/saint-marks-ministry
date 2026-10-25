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

// Fixed church location: 427 West Side Ave at Clarke Ave, Jersey City.
// Address: https://saintmark.com/contact/directions/
// Building coordinates (OpenStreetMap way 310223954): https://mapcarta.com/W310223954
// Keep this server-selected point independent of client input and external service availability.
const MEETING_VENUE = Object.freeze({ latitude: 40.71602, longitude: -74.08670 })

/** Return the fixed venue without a network lookup. Shared with online exam checks. */
export async function meetingVenue(): Promise<{ latitude: number; longitude: number }> {
  return MEETING_VENUE
}
