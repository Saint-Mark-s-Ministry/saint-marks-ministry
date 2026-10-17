import { describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { migrateStudentPrepData } from '@/lib/student-prep-migration'

function transaction() {
  const models = ['studentEnrollment', 'attendanceRecord', 'examScore', 'studentNote', 'expectedAbsence', 'studentSlip', 'sundaySchoolAssignment', 'annualMentorInformation', 'makeupExamBooking', 'digitalExamAttempt', 'registrationSubmission'] as const
  const db = Object.fromEntries(models.map(name => [name, { updateMany: vi.fn().mockResolvedValue({ count: name === 'examScore' ? 5 : 1 }) }])) as Record<typeof models[number], { updateMany: ReturnType<typeof vi.fn> }>
  const execute = vi.fn().mockResolvedValue(2)
  return { db, execute, tx: { ...db, $executeRaw: execute } as unknown as Prisma.TransactionClient }
}

describe('SP account history transfer', () => {
  it('moves every supported SP student record and keeps the original enrollment and record IDs', async () => {
    const { tx, db, execute } = transaction()
    const counts = await migrateStudentPrepData(tx, 'old-student', 'new-student')
    for (const [name, model] of Object.entries(db)) {
      if (name === 'registrationSubmission') continue
      expect(model.updateMany).toHaveBeenCalledWith({ where: { studentId: 'old-student' }, data: { studentId: 'new-student' } })
    }
    expect(db.studentNote.updateMany).toHaveBeenCalledWith({ where: { studentId: 'new-student', authorId: 'old-student' }, data: { authorId: 'new-student' } })
    expect(db.registrationSubmission.updateMany).toHaveBeenCalledWith({ where: { createdUserId: 'old-student' }, data: { createdUserId: 'new-student' } })
    expect(execute.mock.calls[0].slice(1)).toEqual(['new-student', 'old-student'])
    expect(counts).toMatchObject({ exams: 5, attendance: 1, enrollments: 1, legacySubmissions: 2 })
    // Only the explicit prep delegates above are available. No ministry scope,
    // role tags, login credentials, or guardian relationships are transferred.
  })

  it('rejects transferring an account to itself before touching records', async () => {
    const { tx, db, execute } = transaction()
    await expect(migrateStudentPrepData(tx, 'same', 'same')).rejects.toThrow('different accounts')
    expect(db.studentEnrollment.updateMany).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('propagates a record conflict so the enclosing approval transaction rolls back', async () => {
    const { tx, db } = transaction()
    db.examScore.updateMany.mockRejectedValue(new Error('Unique constraint'))
    await expect(migrateStudentPrepData(tx, 'old', 'new')).rejects.toThrow('Unique constraint')
    expect(db.studentNote.updateMany).not.toHaveBeenCalled()
  })
})
