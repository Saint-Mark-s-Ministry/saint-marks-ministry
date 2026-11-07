import type { Prisma } from '@prisma/client'

/** Preview or insert missing pre-verification absences; never overwrite history. */
export async function repairMentorReactivationAttendance(tx: Prisma.TransactionClient, apply = false) {
  const year = await tx.academicYear.findFirst({ where: { isActive: true }, select: { id: true } })
  if (!year) throw new Error('No active academic year is configured')
  const enrollments = await tx.studentEnrollment.findMany({
    where: {
      status: 'ACTIVE', isActive: true, yearLevel: 'YEAR_2', isAsyncStudent: false,
      student: { annualMentorInformation: { some: { academicYearId: year.id, reviewedAt: { not: null } } } },
    },
    select: {
      studentId: true, attendanceStartDate: true,
      student: { select: { annualMentorInformation: {
        where: { academicYearId: year.id }, select: { reviewedAt: true },
      } } },
    },
  })
  const lessons = await tx.lesson.findMany({
    where: {
      academicYearId: year.id, status: { notIn: ['CANCELLED', 'NO_CLASS'] },
      isExamDay: false, attendanceRecords: { some: {} },
    },
    select: { id: true, scheduledDate: true },
  })
  const existing = await tx.attendanceRecord.findMany({
    where: { studentId: { in: enrollments.map(e => e.studentId) }, lessonId: { in: lessons.map(l => l.id) } },
    select: { studentId: true, lessonId: true },
  })
  const keys = new Set(existing.map(r => `${r.studentId}:${r.lessonId}`))
  const records = enrollments.flatMap(enrollment => {
    const reviewedAt = enrollment.student.annualMentorInformation[0]?.reviewedAt
    return lessons.filter(lesson => reviewedAt && lesson.scheduledDate <= reviewedAt &&
      (!enrollment.attendanceStartDate || lesson.scheduledDate >= enrollment.attendanceStartDate) &&
      !keys.has(`${enrollment.studentId}:${lesson.id}`)
    ).map(lesson => ({ lessonId: lesson.id, studentId: enrollment.studentId, status: 'ABSENT' as const, recordedBy: null }))
  })
  const created = apply && records.length
    ? (await tx.attendanceRecord.createMany({ data: records, skipDuplicates: true })).count
    : 0
  return {
    mode: apply ? 'applied' : 'preview', academicYearId: year.id,
    eligibleStudents: enrollments.length,
    affectedStudents: new Set(records.map(r => r.studentId)).size,
    missingRecords: records.length, created,
  }
}
