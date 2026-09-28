import { prisma } from "./prisma"
import type { SundaySchoolLevel } from "@prisma/client"
import {
  getClassMeetingDay,
  normalizeSessionDate,
  type SundaySchoolMeetingDay,
} from "./sunday-school-class"

export const SUNDAY_SCHOOL_LESSON_WINDOW_WEEKS = 8

export type SundaySchoolWeeklyLessonStatus = "UNASSIGNED" | "NEEDS_LINKS" | "READY"

export interface SundaySchoolLessonResourceInput {
  title: string
  url: string
}

// Keep this deliberately structural: the application Prisma client has a
// global password omission, while transaction clients do not. These are the
// only two operations this helper needs from either client shape.
type LessonDatabase = {
  sundaySchoolClass: {
    findMany(args: {
      where: {
        isActive: boolean
        OR: [
          { sundaySchoolYear: { status: "OPEN" } },
          { sundaySchoolYearId: null; academicYear: { isActive: boolean } },
        ]
        id?: { in: string[] }
      }
      select: {
        id: true
        level: true
        academicYear: { select: { startDate: true; endDate: true } }
        sundaySchoolYear: { select: { startDate: true; endDate: true } }
      }
    }): Promise<Array<{
      id: string
      level: SundaySchoolLevel
      academicYear: { startDate: Date; endDate: Date }
      sundaySchoolYear: { startDate: Date; endDate: Date } | null
    }>>
  }
  sundaySchoolWeeklyLesson: {
    createMany(args: {
      data: Array<{ classId: string; sundayDate: Date }>
      skipDuplicates: boolean
    }): Promise<{ count: number }>
  }
}

export function getUpcomingSundays(
  from: Date = new Date(),
  count = SUNDAY_SCHOOL_LESSON_WINDOW_WEEKS
): Date[] {
  return getUpcomingMeetingDates(from, 0, count)
}

export function getUpcomingMeetingDates(
  from: Date = new Date(),
  meetingDay: SundaySchoolMeetingDay = 0,
  count = SUNDAY_SCHOOL_LESSON_WINDOW_WEEKS
): Date[] {
  const start = normalizeSessionDate(from)
  const daysUntilMeeting = (meetingDay - start.getUTCDay() + 7) % 7
  start.setUTCDate(start.getUTCDate() + daysUntilMeeting)

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start)
    date.setUTCDate(start.getUTCDate() + index * 7)
    return date
  })
}

export function getSundaysInRange(startDate: Date, endDate: Date): Date[] {
  return getMeetingDatesInRange(startDate, endDate, 0)
}

export function getMeetingDatesInRange(
  startDate: Date,
  endDate: Date,
  meetingDay: SundaySchoolMeetingDay
): Date[] {
  const end = normalizeSessionDate(endDate)
  const firstMeeting = getUpcomingMeetingDates(startDate, meetingDay, 1)[0]
  const dates: Date[] = []
  for (const date = new Date(firstMeeting); date <= end; date.setUTCDate(date.getUTCDate() + 7)) {
    dates.push(new Date(date))
  }
  return dates
}

export function getWeeklyLessonStatus(
  ownerId: string | null,
  resourceCount: number
): SundaySchoolWeeklyLessonStatus {
  if (!ownerId) return "UNASSIGNED"
  if (resourceCount === 0) return "NEEDS_LINKS"
  return "READY"
}

export function validateWeeklyLessonResources(value: unknown):
  | { ok: true; resources: SundaySchoolLessonResourceInput[] }
  | { ok: false; error: string } {
  if (!Array.isArray(value)) {
    return { ok: false, error: "Resources must be an array" }
  }

  const resources: SundaySchoolLessonResourceInput[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Each resource needs a title and URL" }
    }

    const candidate = item as { title?: unknown; url?: unknown }
    const title = typeof candidate.title === "string" ? candidate.title.trim() : ""
    const url = typeof candidate.url === "string" ? candidate.url.trim() : ""
    if (!title || !url) {
      return { ok: false, error: "Each resource needs a title and URL" }
    }

    try {
      const parsed = new URL(url)
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { ok: false, error: "Resource URLs must start with http:// or https://" }
      }
    } catch {
      return { ok: false, error: "Enter a valid resource URL" }
    }

    resources.push({ title, url })
  }

  return { ok: true, resources }
}

export async function ensureSundaySchoolWeeklyLessons({
  classIds,
  db = prisma,
}: {
  classIds?: string[]
  db?: LessonDatabase
} = {}) {
  const classes = await db.sundaySchoolClass.findMany({
    where: {
      isActive: true,
      OR: [
        { sundaySchoolYear: { status: "OPEN" } },
        { sundaySchoolYearId: null, academicYear: { isActive: true } },
      ],
      ...(classIds ? { id: { in: classIds } } : {}),
    },
    select: {
      id: true,
      level: true,
      academicYear: { select: { startDate: true, endDate: true } },
      sundaySchoolYear: { select: { startDate: true, endDate: true } },
    },
  })

  const rows = classes.flatMap((cls) => {
    const lessonYear = cls.sundaySchoolYear ?? cls.academicYear
    const yearStart = normalizeSessionDate(lessonYear.startDate)
    const yearEnd = normalizeSessionDate(lessonYear.endDate)
    return getMeetingDatesInRange(yearStart, yearEnd, getClassMeetingDay(cls.level))
      .map((sundayDate) => ({ classId: cls.id, sundayDate }))
  })

  if (rows.length === 0) {
    return { classes: classes.length, attempted: 0, created: 0 }
  }

  const result = await db.sundaySchoolWeeklyLesson.createMany({
    data: rows,
    skipDuplicates: true,
  })

  return { classes: classes.length, attempted: rows.length, created: result.count }
}
