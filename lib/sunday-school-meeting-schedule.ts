import type { SundaySchoolLevel } from '@prisma/client'
import { getClassMeetingDay, normalizeSessionDate, toDateInputValue } from './sunday-school-class'

// Sunday servants meetings begin with the first actual meeting, October 18, 2026.
export const FIRST_SUNDAY_SERVANTS_MEETING = '2026-10-18'

type MeetingGroup = { name: string; isElementary?: boolean; levels: SundaySchoolLevel[] }
export function isElementaryMeetingGroup(group: MeetingGroup) {
  return group.isElementary || /\belementary\b/i.test(group.name) ||
    (group.levels.length > 0 && group.levels.every(level => getClassMeetingDay(level) === 6))
}
export function meetingScheduleLabel(group: MeetingGroup) {
  return isElementaryMeetingGroup(group) ? 'First Saturday of every month' : 'Third Sunday of every month'
}
export function scheduledMeetingDates(group: MeetingGroup, start: Date, end: Date): Date[] {
  const elementary = isElementaryMeetingGroup(group)
  const dates: Date[] = []
  const month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  while (month <= end) {
    const day = 1 + ((elementary ? 6 : 0) - month.getUTCDay() + 7) % 7 + (elementary ? 0 : 14)
    const date = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day))
    if (date >= normalizeSessionDate(start) && date <= normalizeSessionDate(end) &&
        (elementary || toDateInputValue(date) >= FIRST_SUNDAY_SERVANTS_MEETING)) dates.push(date)
    month.setUTCMonth(month.getUTCMonth() + 1)
  }
  return dates
}
export function scheduledMeetingId(groupId: string, date: Date) {
  return `scheduled:${groupId}:${toDateInputValue(date)}`
}
