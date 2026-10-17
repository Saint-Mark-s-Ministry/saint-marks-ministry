import { validMeetingPosition, type MeetingPosition } from '@/lib/meeting-geofence'

/** Request a new precise fix; coordinates are never persisted on the device. */
export async function capturePreciseLocation(): Promise<MeetingPosition> {
  if (!navigator.geolocation) throw new Error('Location is unavailable on this device. Please contact your proctor.')
  const result = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve,
      () => reject(new Error('Could not get your location. Enable precise location access and try again.')),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 })
  })
  const position = { latitude: result.coords.latitude, longitude: result.coords.longitude, accuracy: result.coords.accuracy, timestamp: result.timestamp }
  if (!validMeetingPosition(position)) throw new Error('Could not get a precise location. Enable precise location access and try again.')
  return position
}
