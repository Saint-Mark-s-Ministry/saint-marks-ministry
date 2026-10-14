import { prisma } from './prisma'
import { notifySundaySchoolLessonReminder } from './notifications'
import { normalizeSessionDate } from './sunday-school-class'
import { sundaySchoolAssignableUserWhere } from './sunday-school-assignees'
import { formatDateUTC } from './utils'

/** Tuesday before the next meeting, including Saturday Elementary classes. */
export async function sendSundaySchoolLessonReminders(now = new Date()) {
  const tuesday = normalizeSessionDate(now)
  if (tuesday.getUTCDay() !== 2) return { lessons: 0, sent: 0 }

  const nextTuesday = new Date(tuesday)
  nextTuesday.setUTCDate(nextTuesday.getUTCDate() + 7)
  const lessons = await prisma.sundaySchoolWeeklyLesson.findMany({
    where: {
      sundayDate: { gt: tuesday, lt: nextTuesday },
      ownerId: { not: null },
      owner: sundaySchoolAssignableUserWhere,
      class: {
        isActive: true,
        OR: [
          { sundaySchoolYear: { status: 'OPEN' } },
          { sundaySchoolYearId: null, academicYear: { isActive: true } },
        ],
      },
    },
    select: {
      id: true, ownerId: true, title: true, sundayDate: true,
      class: { select: { id: true, name: true, academicYearId: true } },
    },
    orderBy: [{ sundayDate: 'asc' }, { id: 'asc' }],
  })

  let sent = 0
  for (const lesson of lessons) {
    if (!lesson.ownerId) continue
    // A former class servant may still be named on a plan. Never remind them.
    const assignment = await prisma.sundaySchoolServantAssignment.findFirst({
      where: {
        userId: lesson.ownerId, classId: lesson.class.id,
        academicYearId: lesson.class.academicYearId, endedAt: null,
        user: sundaySchoolAssignableUserWhere,
      },
      select: { id: true },
    })
    if (!assignment) continue
    if (await notifySundaySchoolLessonReminder({
      lessonId: lesson.id, userId: lesson.ownerId,
      className: lesson.class.name, lessonTitle: lesson.title,
      lessonDate: formatDateUTC(lesson.sundayDate),
    })) sent++
  }
  return { lessons: lessons.length, sent }
}
