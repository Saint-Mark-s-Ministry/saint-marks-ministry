import type { Prisma } from '@prisma/client'

/** Only called for a newly created, empty student account, inside approval's transaction. */
export async function migrateStudentPrepData(
  tx: Prisma.TransactionClient,
  oldStudentId: string,
  newStudentId: string,
) {
  if (oldStudentId === newStudentId) throw new Error('The migration requires two different accounts')

  // Move the enrollment itself so dates, async settings, graduation information,
  // and mentor assignment history stay attached to the same enrollment record.
  const enrollments = await tx.studentEnrollment.updateMany({
    where: { studentId: oldStudentId }, data: { studentId: newStudentId },
  })
  const attendance = await tx.attendanceRecord.updateMany({
    where: { studentId: oldStudentId }, data: { studentId: newStudentId },
  })
  const exams = await tx.examScore.updateMany({
    where: { studentId: oldStudentId }, data: { studentId: newStudentId },
  })
  const notes = await tx.studentNote.updateMany({
    where: { studentId: oldStudentId }, data: { studentId: newStudentId },
  })
  // A self-authored note must not cascade away when its old author is deleted.
  await tx.studentNote.updateMany({
    where: { studentId: newStudentId, authorId: oldStudentId }, data: { authorId: newStudentId },
  })
  const expectedAbsences = await tx.expectedAbsence.updateMany({
    where: { studentId: oldStudentId }, data: { studentId: newStudentId },
  })
  const slips = await tx.studentSlip.updateMany({
    where: { studentId: oldStudentId }, data: { studentId: newStudentId },
  })
  // This is the prep-side serving requirement, not Sunday School ministry authority.
  // Its logs keep the same assignment IDs, just as attendance keeps its slip IDs.
  const servingAssignments = await tx.sundaySchoolAssignment.updateMany({
    where: { studentId: oldStudentId }, data: { studentId: newStudentId },
  })
  const mentorInformation = await tx.annualMentorInformation.updateMany({
    where: { studentId: oldStudentId }, data: { studentId: newStudentId },
  })
  const makeupBookings = await tx.makeupExamBooking.updateMany({
    where: { studentId: oldStudentId }, data: { studentId: newStudentId },
  })
  const digitalAttempts = await tx.digitalExamAttempt.updateMany({
    where: { studentId: oldStudentId }, data: { studentId: newStudentId },
  })
  const applications = await tx.registrationSubmission.updateMany({
    where: { createdUserId: oldStudentId }, data: { createdUserId: newStudentId },
  })
  // Prisma intentionally ignores this retired model; preserve existing historical
  // submissions without making the legacy feature available again.
  const legacySubmissions = await tx.$executeRaw`
    UPDATE "AsyncNoteSubmission" SET "studentId" = ${newStudentId}
    WHERE "studentId" = ${oldStudentId}
  `

  return {
    enrollments: enrollments.count,
    attendance: attendance.count,
    exams: exams.count,
    notes: notes.count,
    expectedAbsences: expectedAbsences.count,
    slips: slips.count,
    servingAssignments: servingAssignments.count,
    mentorInformation: mentorInformation.count,
    makeupBookings: makeupBookings.count,
    digitalAttempts: digitalAttempts.count,
    applications: applications.count,
    legacySubmissions,
  }
}

export type StudentPrepMigrationSummary = Awaited<ReturnType<typeof migrateStudentPrepData>>
