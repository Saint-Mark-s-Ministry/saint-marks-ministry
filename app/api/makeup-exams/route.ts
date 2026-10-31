import { applicableExamYears } from '@/lib/enrollment-year'
import { after, NextResponse } from 'next/server'
import { Prisma, RoleTag } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { getAuthorizationContext, assertCanWriteBusinessData } from '@/lib/authorization'
import { handleApiError } from '@/lib/api-utils'
import { upcomingMakeupFridays, makeupToday, isMakeupFriday, makeupExamReason } from '@/lib/makeup-exams'
import { createMakeupBookingNotifications, deliverMakeupBookingNotifications } from '@/lib/makeup-exam-notifications'

async function access(write = false) {
  const user = await requireAuth()
  const context = await getAuthorizationContext(user.id)
  if (context.disabled) throw new Error('Forbidden')
  if (write) assertCanWriteBusinessData(context)
  const staff = context.roleTags.has(RoleTag.SUPER_ADMIN) || context.roleTags.has(RoleTag.SERVANTS_PREP_SERVANT) || context.roleTags.has(RoleTag.PRIEST)
  if (!staff && !context.roleTags.has(RoleTag.SERVANTS_PREP_STUDENT)) throw new Error('Forbidden')
  return { user, staff }
}

const examInclude = { examSection: true, academicYear: { select: { name: true } } } as const

async function eligibleExams(studentId: string) {
  const enrollment = await prisma.studentEnrollment.findUnique({ where: { studentId }, include: { academicYear: { select: { startDate: true } } } })
  if (!enrollment?.isActive || enrollment.status !== 'ACTIVE') return []
  const exams = await prisma.exam.findMany({
    where: {
      // Year 2 students may also retake failed or missed Year 1 exams.
      yearLevel: { in: applicableExamYears(enrollment.yearLevel, enrollment.isAsyncStudent, true) },
      examDate: { lt: new Date(`${makeupToday()}T00:00:00Z`) },
      ...(enrollment.academicYear ? { academicYear: { startDate: { gte: enrollment.academicYear.startDate } } } : { academicYear: { isActive: true } }),
    },
    include: { ...examInclude, scores: { where: { studentId }, select: { percentage: true } } },
    orderBy: { examDate: 'desc' },
  })
  return exams.flatMap(({ scores, ...exam }) => {
    const currentPercentage = scores[0]?.percentage ?? null
    const reason = makeupExamReason(currentPercentage, exam.examSection.passingScore)
    return reason ? [{ ...exam, reason, currentPercentage }] : []
  })
}

export async function GET() {
  try {
    const { user, staff } = await access()
    const [exams, bookings] = await Promise.all([
      staff ? Promise.resolve([]) : eligibleExams(user.id),
      prisma.makeupExamBooking.findMany({
        where: staff ? {} : { studentId: user.id },
        include: { exam: { include: examInclude }, ...(staff ? { student: { select: { name: true, email: true } } } : {}) },
        orderBy: { scheduledDate: 'asc' },
      }),
    ])
    return NextResponse.json({ exams, bookings, fridays: upcomingMakeupFridays() })
  } catch (error) { return handleApiError(error) }
}

export async function POST(request: Request) {
  try {
    const { user, staff } = await access(true)
    if (staff) throw new Error('Forbidden')
    const body = await request.json().catch(() => null)
    if (!body || typeof body.examId !== 'string' || !isMakeupFriday(body.scheduledDate)) {
      return NextResponse.json({ error: 'Choose an exam and one of the available Fridays.' }, { status: 400 })
    }
    const exams = await eligibleExams(user.id)
    if (!exams.some(exam => exam.id === body.examId)) {
      return NextResponse.json({ error: 'This exam is not eligible for a makeup.' }, { status: 400 })
    }
    const save = () => prisma.$transaction(async tx => {
      const where = { studentId_examId: { studentId: user.id, examId: body.examId } }
      const existing = await tx.makeupExamBooking.findUnique({ where })
      const scheduledDate = new Date(`${body.scheduledDate}T00:00:00Z`)
      if (existing?.scheduledDate.getTime() === scheduledDate.getTime()) {
        return { booking: existing, deliveries: [] }
      }
      const saved = await tx.makeupExamBooking.upsert({
        where,
        create: { studentId: user.id, examId: body.examId, scheduledDate },
        update: { scheduledDate },
        include: { student: { select: { name: true } }, exam: { include: examInclude } },
      })
      const deliveries = await createMakeupBookingNotifications(tx, saved, existing?.scheduledDate)
      const { student: _student, exam: _exam, ...booking } = saved
      return { booking, deliveries }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    let result: Awaited<ReturnType<typeof save>> | undefined
    for (let attempt = 0; attempt < 3; attempt++) {
      try { result = await save(); break } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 2) throw error
      }
    }
    if (!result) throw new Error('Booking could not be saved')
    const { booking, deliveries } = result
    if (deliveries.length) after(async () => {
      try { await deliverMakeupBookingNotifications(deliveries) }
      catch { console.error('[makeup-booking] could not deliver external notifications') }
    })
    return NextResponse.json(booking)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return NextResponse.json({ error: 'This exam is already booked. Refresh and try again.' }, { status: 409 })
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return NextResponse.json({ error: 'Your booking changed while saving. Refresh and try again.' }, { status: 409 })
    return handleApiError(error)
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, staff } = await access(true)
    if (staff) throw new Error('Forbidden')
    const body = await request.json().catch(() => null)
    if (!body || typeof body.id !== 'string') return NextResponse.json({ error: 'A booking is required.' }, { status: 400 })
    const result = await prisma.makeupExamBooking.deleteMany({ where: { id: body.id, studentId: user.id, scheduledDate: { gt: new Date(`${makeupToday()}T00:00:00Z`) } } })
    if (!result.count) throw new Error('Not found')
    return NextResponse.json({ success: true })
  } catch (error) { return handleApiError(error) }
}
