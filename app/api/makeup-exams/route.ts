import { NextResponse } from 'next/server'
import { Prisma, RoleTag } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { getAuthorizationContext, assertCanWriteBusinessData } from '@/lib/authorization'
import { handleApiError } from '@/lib/api-utils'
import { upcomingMakeupFridays, makeupToday, isMakeupFriday, makeupExamReason } from '@/lib/makeup-exams'

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
      yearLevel: { in: enrollment.yearLevel === 'YEAR_2' ? ['YEAR_1', 'YEAR_2', 'BOTH'] : ['YEAR_1', 'BOTH'] },
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
    const booking = await prisma.makeupExamBooking.upsert({
      where: { studentId_examId: { studentId: user.id, examId: body.examId } },
      create: { studentId: user.id, examId: body.examId, scheduledDate: new Date(`${body.scheduledDate}T00:00:00Z`) },
      update: { scheduledDate: new Date(`${body.scheduledDate}T00:00:00Z`) },
    })
    return NextResponse.json(booking)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return NextResponse.json({ error: 'This exam is already booked. Refresh and try again.' }, { status: 409 })
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
