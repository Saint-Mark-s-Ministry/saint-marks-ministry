/** One-time release repair. Defaults to a read-only preview; --apply writes. */
import { Prisma, PrismaClient } from '@prisma/client'
import { resetYearTwoMentors } from '../lib/mentor-assignments'

const db = new PrismaClient()
const apply = process.argv.includes('--apply')
try {
  const result = await db.$transaction(async tx => {
    const year = await tx.academicYear.findFirst({ where: { isActive: true }, select: { id: true } })
    if (!year) throw new Error('No active academic year is configured')
    const enrollments = await tx.studentEnrollment.findMany({
      where: {
        isActive: true, yearLevel: 'YEAR_2',
        student: { annualMentorInformation: { none: { academicYearId: year.id } } },
        OR: [
          { mentorId: { not: null } }, { mentorName: { not: null } }, { mentorPhone: { not: null } },
          { mentorAssignments: { some: { endedAt: null } } },
        ],
      },
      select: { id: true, studentId: true, mentorId: true },
    })
    if (apply) await resetYearTwoMentors(tx, enrollments, null, year.id)
    return { mode: apply ? 'applied' : 'preview', affectedEnrollments: enrollments.length }
  }, { timeout: 30_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  console.log(JSON.stringify(result))
} catch (error: unknown) {
  console.error(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034'
    ? 'A concurrent roster change prevented the repair. No repair was committed; retry it.'
    : 'Year 2 mentor repair failed. Check the active year and database configuration; no repair was committed.')
  process.exitCode = 1
} finally {
  await db.$disconnect()
}
