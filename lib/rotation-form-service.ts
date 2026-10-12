import { Prisma } from '@prisma/client'
import { ROTATION_WEEKS, ROTATION_LEVELS, RotationWorkflowError, rotationCanSubmit, rotationWeekDate, nextRotationLevel } from '@/lib/rotation-forms'
import { rotationGradeForClassLevel } from '@/lib/sunday-school-utils'

/** Approve evidence and advance together: neither half can commit on its own. */
export async function approveAndAdvanceRotation(
  tx: Prisma.TransactionClient,
  input: { formId: string; reviewerId: string; expectedVersion: number; nextStartDate: Date; reviewNotes: string | null },
) {
  const form = await tx.sundaySchoolRotationForm.findUnique({
    where: { id: input.formId },
    include: { assignment: true },
  })
  if (!form) throw new RotationWorkflowError('Rotation form not found', 404)
  if (form.status !== 'PENDING') throw new RotationWorkflowError('This form has already been reviewed')
  if (form.version !== input.expectedVersion) throw new RotationWorkflowError('The uploaded form changed. Refresh before reviewing it')
  const current = form.assignment
  if (current.studentId === input.reviewerId) throw new RotationWorkflowError('A different Servants Prep servant must review this form', 403)
  if (!current.isActive || current.totalWeeks !== ROTATION_WEEKS) {
    throw new RotationWorkflowError('Only an active four-week rotation can advance')
  }
  if (!rotationCanSubmit(current.startDate)) throw new RotationWorkflowError('All four rotation weeks must be completed first')
  const nextLevel = nextRotationLevel(form.level)
  const approved = await tx.sundaySchoolRotationForm.findMany({
    where: { status: 'APPROVED', assignment: { studentId: current.studentId } },
    select: { level: true },
  })
  const completedLevels = new Set(approved.map(form => form.level))
  completedLevels.add(form.level)
  const cycleComplete = ROTATION_LEVELS.every(level => completedLevels.has(level))
  if (input.nextStartDate < rotationWeekDate(current.startDate, ROTATION_WEEKS + 1)) {
    throw new RotationWorkflowError('The next rotation must start after the current four weeks', 400)
  }
  const [enrollment, activeYear, nextClasses] = await Promise.all([
    tx.studentEnrollment.findUnique({ where: { studentId: current.studentId }, select: { isActive: true, isAsyncStudent: true, status: true } }),
    tx.academicYear.findFirst({ where: { isActive: true }, select: { id: true } }),
    cycleComplete ? Promise.resolve([]) : tx.sundaySchoolClass.findMany({
      where: { level: nextLevel, isActive: true, status: 'ACTIVE', sundaySchoolYear: { status: 'OPEN' } },
      select: { id: true, level: true, _count: { select: { asyncRotations: { where: { isActive: true, student: { enrollments: { some: { isActive: true, isAsyncStudent: true, status: 'ACTIVE' } } } } } } } },
      orderBy: { name: 'asc' },
    }),
  ])
  // Prefer an empty class; if all are occupied, spread rotating students across
  // the least occupied classes. The serializable transaction protects allocation.
  const nextClass = nextClasses.reduce<(typeof nextClasses)[number] | undefined>((best, candidate) =>
    !best || candidate._count.asyncRotations < best._count.asyncRotations ? candidate : best, undefined)
  if (!enrollment?.isActive || !enrollment.isAsyncStudent || enrollment.status !== 'ACTIVE') throw new RotationWorkflowError('Student must have an active async enrollment')
  if (!activeYear || (!cycleComplete && !nextClass)) throw new RotationWorkflowError('An active class for the next grade and academic year is required', 400)

  const changed = await tx.sundaySchoolRotationForm.updateMany({
    where: { id: form.id, status: 'PENDING', version: input.expectedVersion },
    data: { status: 'APPROVED', version: { increment: 1 }, reviewedById: input.reviewerId, reviewedAt: new Date(), reviewNotes: input.reviewNotes },
  })
  if (changed.count !== 1) throw new RotationWorkflowError('The uploaded form changed. Refresh before reviewing it')

  // Preserve prior verified records while the four signed weeks count
  // toward this rotation. Rejected or unrecorded weeks receive the approved form.
  for (let weekNumber = 1; weekNumber <= ROTATION_WEEKS; weekNumber++) {
    const key = { assignmentId_weekNumber: { assignmentId: current.id, weekNumber } }
    const log = await tx.sundaySchoolLog.findUnique({ where: key })
    if (log && (log.status === 'VERIFIED' || log.status === 'MANUAL')) continue
    await tx.sundaySchoolLog.upsert({
      where: key,
      create: { assignmentId: current.id, weekNumber, weekOf: rotationWeekDate(current.startDate, weekNumber), status: 'MANUAL', markedBy: input.reviewerId, rotationFormId: form.id },
      update: { status: 'MANUAL', markedBy: input.reviewerId, rotationFormId: form.id, codeId: null, notes: input.reviewNotes },
    })
  }
  const closed = await tx.sundaySchoolAssignment.updateMany({ where: { id: current.id, isActive: true }, data: { isActive: false } })
  if (closed.count !== 1) throw new RotationWorkflowError('The rotation has changed. Refresh before reviewing it')
  if (cycleComplete) return null
  if (!nextClass) throw new RotationWorkflowError('Next class not found', 400)
  return tx.sundaySchoolAssignment.create({
    data: {
      studentId: current.studentId, academicYearId: activeYear.id, yearLevel: null,
      classId: nextClass.id, grade: rotationGradeForClassLevel(nextClass.level),
      startDate: input.nextStartDate, totalWeeks: ROTATION_WEEKS, assignedBy: input.reviewerId,
    },
    include: { class: { select: { id: true, name: true } } },
  })
}
