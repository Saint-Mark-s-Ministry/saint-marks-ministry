import { ExamError } from '@/lib/digital-exams'
import { distanceMeters, MEETING_ADDRESS, MEETING_RADIUS_METERS, meetingVenue, validMeetingPosition } from '@/lib/meeting-geofence'

/** Use the same fixed church boundary as servants meeting check-in. */
export async function verifyExamLocation(position: unknown) {
  if (!validMeetingPosition(position)) {
    throw new ExamError('Enable precise location and try again. A location captured within two minutes and accurate to within 100 meters is required.', 400)
  }
  let venue
  try { venue = await meetingVenue() } catch {
    throw new ExamError('Could not verify the exam location. Your saved answers are preserved. Please try again or contact your proctor.', 503)
  }
  if (distanceMeters(position, venue) > MEETING_RADIUS_METERS) {
    throw new ExamError(`Online exams must be taken within ${MEETING_RADIUS_METERS} meters of ${MEETING_ADDRESS}. Your saved answers are preserved.`, 403)
  }
}
