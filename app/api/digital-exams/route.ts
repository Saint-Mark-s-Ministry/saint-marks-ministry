import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { examAccess, examApiError, examSummarySelect } from '@/lib/digital-exam-service'

export async function GET() {
  try {
    const { user, staff } = await examAccess()
    const enrollment = staff ? null : await prisma.studentEnrollment.findUnique({ where: { studentId: user.id }, include: { academicYear: { select: { startDate: true } } } })
    if (!staff && (!enrollment?.isActive || enrollment.status !== 'ACTIVE')) return NextResponse.json({ exams: [] })
    const exams = await prisma.exam.findMany({
      where: staff ? {} : {
        digitalSheet: { state: { not: 'DRAFT' } },
        yearLevel: { in: [enrollment!.yearLevel, 'BOTH'] },
        academicYear: enrollment!.academicYear ? { startDate: { gte: enrollment!.academicYear.startDate } } : { isActive: true },
      },
      select: { ...examSummarySelect, digitalSheet: { select: { state: true, releasedAt: true, attempts: { where: { studentId: user.id }, select: { state: true } } } } },
      orderBy: { examDate: 'desc' },
    })
    return NextResponse.json({ exams }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return examApiError(error) }
}
