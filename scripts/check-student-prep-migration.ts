/** Local-only relational check. Every fixture is rolled back, even on failure. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { migrateStudentPrepData } from '../lib/student-prep-migration'
import { deleteUserWithRelations } from '../lib/user-deletion'

const connection = new URL(process.env.SP_DATABASE_URL ?? '')
assert(['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname), 'This check requires a local database')
const db = new PrismaClient()
const suffix = randomUUID()
const oldId = `migration-old-${suffix}`
const newId = `migration-new-${suffix}`
const mentorId = `migration-mentor-${suffix}`
const rollback = new Error('ROLLBACK_CHECK_FIXTURES')

try {
  try {
    await db.$transaction(async tx => {
      for (const [id, role] of [[oldId, 'STUDENT'], [newId, 'STUDENT'], [mentorId, 'MENTOR']] as const) {
        await tx.user.create({ data: { id, role, email: `${id}@example.invalid`, name: 'Migration check', password: 'unusable-local-fixture' } })
      }
      const year = await tx.academicYear.create({ data: { name: `Migration ${suffix}`, startDate: new Date('2025-09-01Z'), endDate: new Date('2026-08-31Z') } })
      const section = await tx.examSection.upsert({ where: { name: 'DOGMA' }, update: {}, create: { name: 'DOGMA', displayName: 'Dogma' } })
      const lesson = await tx.lesson.create({ data: { academicYearId: year.id, examSectionId: section.id, title: 'Migration fixture', lessonNumber: 1, scheduledDate: new Date('2025-10-17Z') } })
      const enrollment = await tx.studentEnrollment.create({ data: { studentId: oldId, academicYearId: year.id, yearLevel: null, mentorId, isAsyncStudent: true, asyncReason: 'Preserve this', attendanceStartDate: new Date('2025-10-01Z') } })
      const mentor = await tx.mentorAssignment.create({ data: { studentEnrollmentId: enrollment.id, mentorUserId: mentorId } })
      const slip = await tx.studentSlip.create({ data: { studentId: oldId, type: 'ATTENDANCE', imageUrl: 'https://example.invalid/slip.png' } })
      const absence = await tx.expectedAbsence.create({ data: { studentId: oldId, startDate: new Date('2025-10-17Z'), endDate: new Date('2025-10-17Z'), reason: 'Preserve absence' } })
      const attendance = await tx.attendanceRecord.create({ data: { studentId: oldId, lessonId: lesson.id, status: 'LATE', slipId: slip.id, expectedAbsenceId: absence.id, notes: 'Original attendance note' } })
      const exam = await tx.exam.create({ data: { academicYearId: year.id, examSectionId: section.id, yearLevel: 'YEAR_2', examDate: new Date('2026-01-01Z') } })
      const score = await tx.examScore.create({ data: { studentId: oldId, examId: exam.id, score: 79.5, percentage: 79.5, notes: 'Original score note', gradedBy: mentorId, gradedAt: new Date('2026-01-02Z') } })
      const makeup = await tx.makeupExamScore.create({ data: { examScoreId: score.id, version: 1, score: 85, totalPoints: 100, percentage: 85, takenDate: new Date('2026-02-01Z'), notes: 'Paper makeup' } })
      await tx.digitalExamSheet.create({ data: { examId: exam.id, choiceCounts: [4], answerKey: ['A'] } })
      const attempt = await tx.digitalExamAttempt.create({ data: { examId: exam.id, studentId: oldId, state: 'SUBMITTED', answers: ['A'], sessionHash: 'fixture-session', correctCount: 1 } })
      const event = await tx.digitalExamEvent.create({ data: { attemptId: attempt.id, kind: 'submit', actorId: oldId } })
      const archive = await tx.digitalExamAttemptArchive.create({ data: { attemptId: attempt.id, attemptNumber: 1, snapshot: { answers: ['A'] }, approvedBy: mentorId } })
      const note = await tx.studentNote.create({ data: { studentId: oldId, authorId: oldId, content: 'Self-authored historical note' } })
      const serving = await tx.sundaySchoolAssignment.create({ data: { studentId: oldId, academicYearId: year.id, yearLevel: 'YEAR_2', grade: 'GRADE_1', startDate: new Date('2025-10-01Z') } })
      const form = await tx.sundaySchoolRotationForm.create({ data: { assignmentId: serving.id, level: 'GRADE_1', fileUrl: 'https://example.invalid/rotation.pdf', filename: 'rotation.pdf', status: 'APPROVED' } })
      const servingLog = await tx.sundaySchoolLog.create({ data: { assignmentId: serving.id, weekNumber: 1, weekOf: new Date('2025-10-01Z'), status: 'VERIFIED', studentNotes: 'Original serving note' } })
      const annual = await tx.annualMentorInformation.create({ data: { studentId: oldId, academicYearId: year.id, mentorName: 'Mentor', mentorEmail: 'mentor@example.invalid', mentorPhone: '5550100' } })
      const booking = await tx.makeupExamBooking.create({ data: { studentId: oldId, examId: exam.id, scheduledDate: new Date('2026-10-23Z') } })
      const invite = await tx.inviteCode.create({ data: { code: suffix, createdBy: mentorId } })
      const application = await tx.registrationSubmission.create({ data: { inviteCodeId: invite.id, createdUserId: oldId, fullName: 'Migration check', email: `${oldId}@example.invalid`, dateOfBirth: new Date('2000-01-01Z'), phone: '5550100', previouslyServed: false, currentlyServing: false, previouslyAttendedPrep: false, grade: 'OTHER' } })
      const legacyId = `migration-legacy-${suffix}`
      await tx.$executeRaw`INSERT INTO "AsyncNoteSubmission" (id, "studentId", "lessonId", content, status, "submittedAt", "createdAt", "updatedAt") VALUES (${legacyId}, ${oldId}, ${lesson.id}, 'Legacy content', 'PENDING', NOW(), NOW(), NOW())`

      await tx.$executeRaw`SAVEPOINT before_transfer`
      const counts = await migrateStudentPrepData(tx, oldId, newId)
      await deleteUserWithRelations(tx, oldId)
      assert.equal(await tx.user.count({ where: { id: oldId } }), 0)
      assert.equal(counts.attendance, 1)
      assert.equal(counts.exams, 1)
      assert.equal(counts.legacySubmissions, 1)
      const movedEnrollment = await tx.studentEnrollment.findUniqueOrThrow({ where: { studentId: newId } })
      assert.equal(movedEnrollment.id, enrollment.id)
      assert.equal(movedEnrollment.academicYearId, year.id)
      assert.equal(movedEnrollment.isAsyncStudent, true)
      assert.equal(movedEnrollment.asyncReason, 'Preserve this')
      assert.equal((await tx.mentorAssignment.findUniqueOrThrow({ where: { id: mentor.id } })).studentEnrollmentId, enrollment.id)
      const movedScore = await tx.examScore.findUniqueOrThrow({ where: { id: score.id } })
      assert.equal(movedScore.studentId, newId)
      assert.equal(movedScore.percentage, 79.5)
      assert.equal(movedScore.notes, score.notes)
      assert.equal(movedScore.gradedAt.toISOString(), score.gradedAt.toISOString())
      assert.equal((await tx.makeupExamScore.findUniqueOrThrow({ where: { id: makeup.id } })).examScoreId, score.id)
      assert.equal((await tx.digitalExamAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).studentId, newId)
      assert.equal((await tx.digitalExamEvent.findUniqueOrThrow({ where: { id: event.id } })).attemptId, attempt.id)
      assert.equal((await tx.digitalExamAttemptArchive.findUniqueOrThrow({ where: { id: archive.id } })).attemptId, attempt.id)
      assert.equal((await tx.sundaySchoolRotationForm.findUniqueOrThrow({ where: { id: form.id } })).assignmentId, serving.id)
      const movedAttendance = await tx.attendanceRecord.findUniqueOrThrow({ where: { id: attendance.id } })
      assert.equal(movedAttendance.studentId, newId)
      assert.equal(movedAttendance.status, 'LATE')
      assert.equal(movedAttendance.slipId, slip.id)
      assert.equal(movedAttendance.expectedAbsenceId, absence.id)
      assert.equal((await tx.studentNote.findUniqueOrThrow({ where: { id: note.id } })).authorId, newId)
      assert.equal((await tx.studentSlip.findUniqueOrThrow({ where: { id: slip.id } })).studentId, newId)
      assert.equal((await tx.expectedAbsence.findUniqueOrThrow({ where: { id: absence.id } })).studentId, newId)
      assert.equal((await tx.sundaySchoolAssignment.findUniqueOrThrow({ where: { id: serving.id } })).studentId, newId)
      assert.equal((await tx.sundaySchoolLog.findUniqueOrThrow({ where: { id: servingLog.id } })).studentNotes, 'Original serving note')
      assert.equal((await tx.annualMentorInformation.findUniqueOrThrow({ where: { id: annual.id } })).studentId, newId)
      assert.equal((await tx.makeupExamBooking.findUniqueOrThrow({ where: { id: booking.id } })).studentId, newId)
      assert.equal((await tx.registrationSubmission.findUniqueOrThrow({ where: { id: application.id } })).createdUserId, newId)
      const legacy = await tx.$queryRaw<Array<{ studentId: string }>>`SELECT "studentId" FROM "AsyncNoteSubmission" WHERE id = ${legacyId}`
      assert.equal(legacy[0].studentId, newId)

      // Simulate an approval failing after transfer/deletion. The original user
      // and records must all return before the outer fixture transaction exits.
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT before_transfer`
      assert.equal(await tx.user.count({ where: { id: oldId } }), 1)
      assert.equal((await tx.examScore.findUniqueOrThrow({ where: { id: score.id } })).studentId, oldId)
      assert.equal((await tx.attendanceRecord.findUniqueOrThrow({ where: { id: attendance.id } })).studentId, oldId)
      assert.equal((await tx.studentEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).studentId, oldId)
      throw rollback
    }, { timeout: 30000 })
  } catch (error: unknown) {
    if (error !== rollback) throw error
  }
  assert.equal(await db.user.count({ where: { id: { in: [oldId, newId, mentorId] } } }), 0)
  console.log('SP history transfer, deletion, relational links, and rollback verified. No fixtures retained.')
} finally {
  await db.$disconnect()
}
