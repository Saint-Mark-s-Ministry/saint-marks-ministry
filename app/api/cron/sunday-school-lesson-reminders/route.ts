import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { notifySundaySchoolLessonReminder } from "@/lib/notifications"
import { normalizeSessionDate } from "@/lib/sunday-school-class"

export const dynamic = "force-dynamic"

// Runs daily (see vercel.json). A window rather than an exact "7 days from
// today" match, so a missed run still catches every lesson due for its
// reminder before next Sunday — reminderSentAt stops any of them from
// going out twice.
const REMINDER_WINDOW_DAYS = { from: 6, to: 9 } as const

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const today = normalizeSessionDate(new Date())
  const from = new Date(today)
  from.setUTCDate(from.getUTCDate() + REMINDER_WINDOW_DAYS.from)
  const to = new Date(today)
  to.setUTCDate(to.getUTCDate() + REMINDER_WINDOW_DAYS.to)

  const due = await prisma.sundaySchoolWeeklyLesson.findMany({
    where: {
      ownerId: { not: null },
      reminderSentAt: null,
      sundayDate: { gte: from, lte: to },
    },
    select: {
      id: true,
      ownerId: true,
      title: true,
      sundayDate: true,
      class: { select: { name: true } },
    },
  })

  let sent = 0
  for (const lesson of due) {
    if (!lesson.ownerId) continue
    await notifySundaySchoolLessonReminder({
      ownerId: lesson.ownerId,
      className: lesson.class.name,
      sundayDate: lesson.sundayDate.toISOString().slice(0, 10),
      lessonTitle: lesson.title,
    })
    sent += 1
  }

  if (due.length > 0) {
    await prisma.sundaySchoolWeeklyLesson.updateMany({
      where: { id: { in: due.map((lesson) => lesson.id) } },
      data: { reminderSentAt: new Date() },
    })
  }

  return NextResponse.json({ success: true, checked: due.length, sent })
}
