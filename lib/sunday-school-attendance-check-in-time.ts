import type { SundaySchoolLevel } from '@prisma/client'
import { getClassMeetingDay, getSundaySchoolTodayDateInputValue, SUNDAY_SCHOOL_TIME_ZONE } from '@/lib/sunday-school-class'

/** Church-local class hour, with 30 minutes of leeway on each side. */
export function getClassCheckInWindow(date: string, level: SundaySchoolLevel) {
  const day = new Date(`${date}T12:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== date || day.getUTCDay() !== getClassMeetingDay(level)) return null
  const startHour = getClassMeetingDay(level) === 6 ? 11 : 12
  const offsetName = new Intl.DateTimeFormat('en-US', { timeZone: SUNDAY_SCHOOL_TIME_ZONE, timeZoneName: 'shortOffset' }).formatToParts(day).find(part => part.type === 'timeZoneName')?.value ?? ''
  const offset = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(offsetName)
  if (!offset) throw new Error('Could not determine church time zone')
  const offsetMinutes = (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3] ?? 0))
  const startsAt = new Date(Date.parse(`${date}T00:00:00Z`) + (startHour * 60 - offsetMinutes) * 60_000)
  return { startsAt, opensAt: new Date(startsAt.getTime() - 30 * 60_000), expiresAt: new Date(startsAt.getTime() + 90 * 60_000) }
}
export function isCheckInMeetingToday(date: Date | string, level: SundaySchoolLevel, now = new Date()) {
  const day = new Date(date)
  if (Number.isNaN(day.getTime())) return false
  const key = day.toISOString().slice(0, 10)
  return key === getSundaySchoolTodayDateInputValue(now) && Boolean(getClassCheckInWindow(key, level))
}
export function checkInIsOpen(window: { closedAt: Date | null; opensAt: Date; expiresAt: Date }, now = new Date()) {
  return !window.closedAt && window.opensAt.getTime() <= now.getTime() && window.expiresAt.getTime() > now.getTime()
}
export function checkInWindowLabel(level: SundaySchoolLevel) {
  return getClassMeetingDay(level) === 6 ? '10:30 a.m.–12:30 p.m.' : '11:30 a.m.–1:30 p.m.'
}
