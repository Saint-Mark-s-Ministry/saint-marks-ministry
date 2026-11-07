import { describe, expect, it, vi } from 'vitest'
import { repairMentorReactivationAttendance } from '@/lib/mentor-reactivation-attendance-repair'

function fixture() {
  return {
    academicYear: { findFirst: vi.fn().mockResolvedValue({ id: 'current-year' }) },
    studentEnrollment: { findMany: vi.fn().mockResolvedValue([{
      studentId: 'student', attendanceStartDate: new Date('2026-10-02T00:00:00Z'),
      student: { annualMentorInformation: [{ reviewedAt: new Date('2026-10-23T12:00:00Z') }] },
    }]) },
    lesson: { findMany: vi.fn().mockResolvedValue([
      { id: 'before-start', scheduledDate: new Date('2026-09-25T00:00:00Z') },
      { id: 'present', scheduledDate: new Date('2026-10-02T00:00:00Z') },
      { id: 'excused', scheduledDate: new Date('2026-10-09T00:00:00Z') },
      { id: 'missed-withdrawn', scheduledDate: new Date('2026-10-16T00:00:00Z') },
      { id: 'verification-day', scheduledDate: new Date('2026-10-23T00:00:00Z') },
      { id: 'after-verification', scheduledDate: new Date('2026-10-30T00:00:00Z') },
    ]) },
    attendanceRecord: {
      findMany: vi.fn().mockResolvedValue([
        { studentId: 'student', lessonId: 'present' },
        { studentId: 'student', lessonId: 'excused' },
      ]),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
  }
}

describe('retroactive mentor reactivation attendance repair', () => {
  it('previews only missing pre-verification lessons, respecting attendance start and existing history', async () => {
    const tx = fixture()
    expect(await repairMentorReactivationAttendance(tx as never)).toEqual({
      mode: 'preview', academicYearId: 'current-year', eligibleStudents: 1,
      affectedStudents: 1, missingRecords: 2, created: 0,
    })
    expect(tx.attendanceRecord.createMany).not.toHaveBeenCalled()
    expect(tx.studentEnrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      status: 'ACTIVE', isActive: true, yearLevel: 'YEAR_2', isAsyncStudent: false,
      student: { annualMentorInformation: { some: { academicYearId: 'current-year', reviewedAt: { not: null } } } },
    } }))
    expect(tx.lesson.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      academicYearId: 'current-year', status: { notIn: ['CANCELLED', 'NO_CLASS'] },
      isExamDay: false, attendanceRecords: { some: {} },
    } }))
  })

  it('inserts missing absences and becomes a no-op when repeated', async () => {
    const tx = fixture()
    expect(await repairMentorReactivationAttendance(tx as never, true)).toMatchObject({ created: 2 })
    const records = ['missed-withdrawn', 'verification-day'].map(lessonId => ({
      lessonId, studentId: 'student', status: 'ABSENT', recordedBy: null,
    }))
    expect(tx.attendanceRecord.createMany).toHaveBeenCalledExactlyOnceWith({ data: records, skipDuplicates: true })
    tx.attendanceRecord.findMany.mockResolvedValue([
      { studentId: 'student', lessonId: 'present' },
      { studentId: 'student', lessonId: 'excused' },
      ...records,
    ])
    expect(await repairMentorReactivationAttendance(tx as never, true)).toMatchObject({ missingRecords: 0, created: 0 })
    expect(tx.attendanceRecord.createMany).toHaveBeenCalledTimes(1)
  })

  it('does nothing if no currently active, verified in-person students qualify', async () => {
    const tx = fixture()
    tx.studentEnrollment.findMany.mockResolvedValue([])
    expect(await repairMentorReactivationAttendance(tx as never, true)).toMatchObject({ eligibleStudents: 0, created: 0 })
    expect(tx.attendanceRecord.createMany).not.toHaveBeenCalled()
  })

  it('refuses to repair without an active academic year', async () => {
    const tx = fixture()
    tx.academicYear.findFirst.mockResolvedValue(null)
    await expect(repairMentorReactivationAttendance(tx as never, true)).rejects.toThrow('No active academic year')
    expect(tx.attendanceRecord.createMany).not.toHaveBeenCalled()
  })
})
