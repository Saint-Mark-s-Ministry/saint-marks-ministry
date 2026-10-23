import { prisma } from './prisma'
import { notifySundaySchoolAttendanceReminder } from './notifications'
import { sundaySchoolAssignableUserWhere } from './sunday-school-assignees'
import {
  getClassMeetingDay,
  getSundaySchoolTodayDateInputValue,
  SUNDAY_SCHOOL_TIME_ZONE,
  toDateInputValue,
} from './sunday-school-class'
import type { SundaySchoolAttendanceReminder } from '@/types/sunday-school-attendance-reminders'

/** Each class starts its reminder week on its meeting day at the church. */
export function attendanceReminderWeek(now = new Date()) {
  const today = new Date(getSundaySchoolTodayDateInputValue(now))
  const sunday = new Date(today)
  sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay())
  const saturday = new Date(today)
  saturday.setUTCDate(saturday.getUTCDate() - (saturday.getUTCDay() + 1) % 7)
  return { today, sunday, saturday }
}

/** Only personally assigned class teams receive reminders, never all classes an admin can see. */
export async function getPendingSundaySchoolAttendance(now = new Date(), userId?: string) {
  const { sunday, saturday } = attendanceReminderWeek(now)
  const assignments = await prisma.sundaySchoolServantAssignment.findMany({
    where: {
      ...(userId ? { userId } : {}),
      classId: { not: null },
      endedAt: null,
      academicYear: { isActive: true },
      user: sundaySchoolAssignableUserWhere,
      class: {
        isActive: true,
        OR: [
          { sundaySchoolYear: { status: 'OPEN' } },
          { sundaySchoolYearId: null, academicYear: { isActive: true } },
        ],
      },
    },
    select: {
      userId: true,
      academicYearId: true,
      class: { select: {
        id: true, name: true, level: true, academicYearId: true,
        children: { where: { isActive: true }, select: { id: true } },
        sessions: {
          where: { date: { in: [saturday, sunday] } },
          select: { date: true, attendance: { select: { childId: true } } },
        },
      } },
    },
    orderBy: { id: 'asc' },
  })

  const pending = new Map<string, SundaySchoolAttendanceReminder & { userId: string }>()
  for (const assignment of assignments) {
    const schoolClass = assignment.class
    if (!schoolClass || assignment.academicYearId !== schoolClass.academicYearId || !schoolClass.children.length) continue
    const date = getClassMeetingDay(schoolClass.level) === 6 ? saturday : sunday
    const session = schoolClass.sessions.find(session => session.date.getTime() === date.getTime())
    const marked = new Set(session?.attendance.map(record => record.childId) ?? [])
    // takenBy is set even by session creation and partial autosaves; it is not completion.
    if (schoolClass.children.every(child => marked.has(child.id))) continue
    const sessionDate = toDateInputValue(date)
    pending.set(`${schoolClass.id}:${assignment.userId}`, {
      userId: assignment.userId,
      classId: schoolClass.id,
      className: schoolClass.name,
      sessionDate,
      url: `/dashboard/servants/attendance?${new URLSearchParams({ classId: schoolClass.id, date: sessionDate })}`,
    })
  }
  return [...pending.values()]
}

/** One Hobby-compatible UTC run; late-morning church time shifts with DST. */
export async function sendSundaySchoolAttendanceReminders(now = new Date()) {
  const { today } = attendanceReminderWeek(now)
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: SUNDAY_SCHOOL_TIME_ZONE, hour: 'numeric', hourCycle: 'h23',
  }).format(now)
  const weekday = today.getUTCDay()
  if (![0, 2, 4, 6].includes(weekday) || !['11', '12'].includes(hour)) return { pending: 0, sent: 0 }

  const pending = (await getPendingSundaySchoolAttendance(now)).filter(reminder =>
    // Initial reminders go only to classes meeting today; follow-ups cover both.
    weekday === 2 || weekday === 4 || new Date(reminder.sessionDate).getUTCDay() === weekday
  )
  let sent = 0
  for (const reminder of pending) {
    if (await notifySundaySchoolAttendanceReminder({ ...reminder, reminderDate: toDateInputValue(today) })) sent++
  }
  return { pending: pending.length, sent }
}
