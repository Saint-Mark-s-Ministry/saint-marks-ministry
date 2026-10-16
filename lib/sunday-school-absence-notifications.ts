import type { AttendanceStatus, SundaySchoolLevel } from '@prisma/client'
import { prisma } from './prisma'
import { notifySundaySchoolAbsence } from './notifications'
import { getClassMeetingDay, normalizeSessionDate } from './sunday-school-class'
import { sundaySchoolAssignableUserWhere } from './sunday-school-assignees'

const WEEK = 7 * 24 * 60 * 60 * 1000

/** Only explicit ABSENT marks on consecutive weekly meetings count. Missing,
 * excused, present and late marks break the streak. Today is still in progress. */
export function getSundaySchoolAbsenceStreak(
  level: SundaySchoolLevel,
  records: Array<{ date: Date; status: AttendanceStatus }>,
  now: Date,
  since: Date,
) {
  const latest = normalizeSessionDate(now)
  do { latest.setUTCDate(latest.getUTCDate() - 1) } while (latest.getUTCDay() !== getClassMeetingDay(level))
  const marks = new Map(records.map(record => [normalizeSessionDate(record.date).getTime(), record.status]))
  let weeks = 0
  let firstAbsenceDate: string | null = null
  for (let date = latest.getTime(); date >= normalizeSessionDate(since).getTime(); date -= WEEK) {
    if (marks.get(date) !== 'ABSENT') break
    weeks++
    firstAbsenceDate = new Date(date).toISOString().slice(0, 10)
  }
  return { weeks, firstAbsenceDate }
}

export async function sendSundaySchoolAbsenceNotifications(now = new Date()) {
  const today = normalizeSessionDate(now)
  const classes = await prisma.sundaySchoolClass.findMany({
    where: {
      isActive: true, status: 'ACTIVE',
      OR: [
        { sundaySchoolYear: { status: 'OPEN', startDate: { lte: today }, endDate: { gte: today } } },
        { sundaySchoolYearId: null, academicYear: { isActive: true } },
      ],
    },
    select: {
      id: true, name: true, level: true, academicYearId: true, sundaySchoolYearId: true,
      createdAt: true, sundaySchoolYear: { select: { startDate: true } },
      children: {
        where: { isActive: true, status: 'ACTIVE' },
        select: { id: true, firstName: true, lastName: true, createdAt: true },
      },
      placements: {
        where: { endedAt: null, enrollment: { status: 'ACTIVE', endedAt: null } },
        select: { startedAt: true, enrollment: { select: { childId: true } } },
      },
    },
  })
  let sent = 0
  for (const cls of classes) {
    const yearScope = cls.sundaySchoolYearId
      ? { sundaySchoolYearId: cls.sundaySchoolYearId }
      : { sundaySchoolYearId: null, academicYearId: cls.academicYearId }
    const [sessions, servants, groups] = await Promise.all([
      prisma.sundaySchoolSession.findMany({
        where: { classId: cls.id, date: { gte: normalizeSessionDate(cls.sundaySchoolYear?.startDate ?? cls.createdAt), lt: today } },
        select: { date: true, attendance: { select: { childId: true, status: true } } },
      }),
      prisma.sundaySchoolServantAssignment.findMany({
        where: { ...yearScope, classId: cls.id, ageGroupId: null, endedAt: null, assignedAt: { lte: now }, user: sundaySchoolAssignableUserWhere },
        select: { userId: true },
      }),
      prisma.sundaySchoolAgeGroup.findMany({
        where: {
          isActive: true, status: 'ACTIVE',
          ...(cls.sundaySchoolYearId
            ? { sundaySchoolYearId: cls.sundaySchoolYearId, levelRows: { some: { level: cls.level } } }
            : { sundaySchoolYearId: null, levels: { has: cls.level } }),
        },
        select: {
          assignments: {
            where: { ...yearScope, authority: 'COORDINATOR', classId: null, endedAt: null, assignedAt: { lte: now }, user: sundaySchoolAssignableUserWhere },
            select: { userId: true },
          },
          overseer: { select: { id: true, role: true, isDisabled: true } },
        },
      }),
    ])
    const marks = new Map<string, Array<{ date: Date; status: AttendanceStatus }>>()
    for (const session of sessions) for (const record of session.attendance) {
      const history = marks.get(record.childId) ?? []
      history.push({ date: session.date, status: record.status })
      marks.set(record.childId, history)
    }
    const placements = new Map(cls.placements.map(p => [p.enrollment.childId, p.startedAt]))
    const escalationIds = groups.flatMap(group => [
      ...group.assignments.map(a => a.userId),
      ...(group.overseer?.role === 'PRIEST' && !group.overseer.isDisabled ? [group.overseer.id] : []),
    ])
    for (const child of cls.children) {
      // Durable-year children must have an active placement in this class.
      if (cls.sundaySchoolYearId && !placements.has(child.id)) continue
      const since = new Date(Math.max(
        child.createdAt.getTime(),
        (placements.get(child.id) ?? cls.createdAt).getTime(),
        (cls.sundaySchoolYear?.startDate ?? cls.createdAt).getTime(),
      ))
      const { weeks, firstAbsenceDate } = getSundaySchoolAbsenceStreak(cls.level, marks.get(child.id) ?? [], now, since)
      if (!firstAbsenceDate || weeks <= 2) continue
      const tiers: Array<{ threshold: 2 | 4; userIds: string[] }> = [
        { threshold: 2, userIds: servants.map(a => a.userId) },
        ...(weeks >= 4 ? [{ threshold: 4 as const, userIds: escalationIds }] : []),
      ]
      for (const tier of tiers) for (const userId of new Set(tier.userIds)) {
        if (await notifySundaySchoolAbsence({
          childId: child.id, childName: `${child.firstName} ${child.lastName}`,
          classId: cls.id, className: cls.name, userId, firstAbsenceDate, weeks, threshold: tier.threshold,
        })) sent++
      }
    }
  }
  return { classes: classes.length, sent }
}
