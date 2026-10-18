import type { AttendanceStatus, SundaySchoolServantAttendanceStatus } from '@prisma/client'
import type { SundaySchoolMeetingDay } from './sunday-school-class'

const DAY_MS = 24 * 60 * 60 * 1000

export interface SundaySchoolAttendanceSessionInput {
  classId: string
  date: Date
  attendance: Array<{ status: AttendanceStatus | SundaySchoolServantAttendanceStatus }>
}

export interface SundaySchoolAttendanceTrendPoint {
  date: string
  attendedCount: number | null
  recordedCount: number | null
  recordedClassCount: number
  attendanceRate: number | null
}

/** The first Sunday strictly after September 11 in the given Gregorian year. */
export function getFirstSundayAfterSeptember11(year: number): Date {
  return getFirstMeetingDayAfterSeptember11(year, 0)
}

/** The first class meeting day strictly after September 11. */
export function getFirstMeetingDayAfterSeptember11(
  year: number,
  meetingDay: SundaySchoolMeetingDay
): Date {
  const firstPossibleDay = new Date(Date.UTC(year, 8, 12))
  const daysUntilMeeting = (meetingDay - firstPossibleDay.getUTCDay() + 7) % 7
  return new Date(firstPossibleDay.getTime() + daysUntilMeeting * DAY_MS)
}

/** The most recent Sunday on or before a UTC calendar day. */
export function getMostRecentSundayUTC(date: Date): Date {
  return getMostRecentMeetingDayUTC(date, 0)
}

export function getMostRecentMeetingDayUTC(
  date: Date,
  meetingDay: SundaySchoolMeetingDay
): Date {
  const daysSinceMeeting = (date.getUTCDay() - meetingDay + 7) % 7
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - daysSinceMeeting
    )
  )
}

/**
 * Reporting follows the class calendar: the first meeting after September 11
 * through the last weekly meeting before the next rollover.
 */
export function getSundaySchoolReportingRange(
  academicYearStart: Date,
  isActive: boolean,
  today: Date = new Date(),
  meetingDay: SundaySchoolMeetingDay = 0
): { start: Date; end: Date } {
  const startYear = academicYearStart.getUTCFullYear()
  const start = getFirstMeetingDayAfterSeptember11(startYear, meetingDay)
  const nextStart = getFirstMeetingDayAfterSeptember11(startYear + 1, meetingDay)
  const lastMeetingInYear = new Date(nextStart.getTime() - 7 * DAY_MS)

  if (!isActive) return { start, end: lastMeetingInYear }

  const mostRecentMeeting = getMostRecentMeetingDayUTC(today, meetingDay)
  return {
    start,
    end: mostRecentMeeting < lastMeetingInYear ? mostRecentMeeting : lastMeetingInYear,
  }
}

/**
 * Aggregate every visible class for each scheduled week. No saved attendance means
 * unknown, so that week is represented by nulls and Recharts renders a gap.
 */
export function buildSundaySchoolAttendanceTrend(
  sessions: SundaySchoolAttendanceSessionInput[],
  start: Date,
  end: Date,
  meetingDay: SundaySchoolMeetingDay = 0
): SundaySchoolAttendanceTrendPoint[] {
  if (end < start) return []

  const totalsByDate = new Map<string, { attended: number; recorded: number; classIds: Set<string> }>()

  for (const session of sessions) {
    if (session.attendance.length === 0) continue

    const normalizedSession = new Date(session.date)
    const daysForward = (meetingDay - normalizedSession.getUTCDay() + 7) % 7
    const daysBackward = (normalizedSession.getUTCDay() - meetingDay + 7) % 7
    normalizedSession.setUTCDate(
      normalizedSession.getUTCDate() + (daysForward < daysBackward ? daysForward : -daysBackward)
    )
    const date = normalizedSession.toISOString().slice(0, 10)
    const totals = totalsByDate.get(date) ?? { attended: 0, recorded: 0, classIds: new Set<string>() }
    totals.recorded += session.attendance.length
    totals.classIds.add(session.classId)
    totals.attended += session.attendance.filter(
      record => record.status === 'PRESENT' || record.status === 'LATE'
    ).length
    totalsByDate.set(date, totals)
  }

  const points: SundaySchoolAttendanceTrendPoint[] = []
  for (let meeting = start; meeting <= end; meeting = new Date(meeting.getTime() + 7 * DAY_MS)) {
    const date = meeting.toISOString().slice(0, 10)
    const totals = totalsByDate.get(date)

    points.push({
      date,
      attendedCount: totals?.attended ?? null,
      recordedCount: totals?.recorded ?? null,
      recordedClassCount: totals?.classIds.size ?? 0,
      attendanceRate: totals
        ? Math.round((totals.attended / totals.recorded) * 1000) / 10
        : null,
    })
  }

  return points
}
