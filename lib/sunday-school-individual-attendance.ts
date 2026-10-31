import type { AttendanceStatus } from '@prisma/client'
import type { IndividualAttendanceHistory } from '@stmark/contracts'
import { calculateAttendanceFromRecords, countAttendanceStatuses } from '@/lib/attendance-utils'

interface ChildName { id: string; firstName: string; lastName: string }
interface HistorySession {
  date: Date | string
  attendance: Array<{ child: ChildName; status: AttendanceStatus }>
}

export function buildIndividualAttendance(
  roster: ChildName[],
  sessions: HistorySession[],
  scheduledDates: Array<Date | string> = []
): IndividualAttendanceHistory {
  const dateKey = (date: Date | string) => new Date(date).toISOString().slice(0, 10)
  const dates = [...new Set([...scheduledDates.map(dateKey), ...sessions.map(session => dateKey(session.date))])].sort()
  const children = new Map(roster.map(child => [child.id, child]))
  const marks = new Map<string, Record<string, AttendanceStatus>>()
  for (const session of sessions) {
    for (const record of session.attendance) {
      children.set(record.child.id, record.child)
      const childMarks = marks.get(record.child.id) ?? {}
      childMarks[dateKey(session.date)] = record.status
      marks.set(record.child.id, childMarks)
    }
  }
  const activeIds = new Set(roster.map(child => child.id))
  return {
    dates,
    children: [...children.values()].map(child => {
      const attendance = marks.get(child.id) ?? {}
      const records = Object.values(attendance).map(status => ({ status }))
      return {
        ...child,
        onRoster: activeIds.has(child.id),
        attendance,
        counts: countAttendanceStatuses(records),
        rate: calculateAttendanceFromRecords(records),
      }
    }).sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName) || a.id.localeCompare(b.id)),
  }
}

export type { IndividualAttendanceHistory }
