import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { backfillAttendanceForStudents } from '@/lib/api-utils'

describe('attendance backfill for promoted students', () => {
  it('creates only missing active-year records and leaves existing history untouched', async () => {
    const tx = {
      lesson: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'lesson-1', scheduledDate: new Date('2026-09-25T00:00:00Z') },
          { id: 'lesson-2', scheduledDate: new Date('2026-10-02T00:00:00Z') },
        ]),
      },
      studentEnrollment: { findMany: vi.fn().mockResolvedValue([]) },
      attendanceRecord: {
        findMany: vi.fn().mockResolvedValue([
          { studentId: 'student-1', lessonId: 'lesson-1' },
        ]),
        createMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
    }

    const created = await backfillAttendanceForStudents(
      ['student-1', 'student-2', 'student-2'],
      'active-year',
      tx as never
    )

    expect(created).toBe(3)
    expect(tx.lesson.findMany).toHaveBeenCalledWith({
      where: {
        academicYearId: 'active-year',
        status: { notIn: ['CANCELLED', 'NO_CLASS'] },
        isExamDay: false,
        attendanceRecords: { some: {} },
      },
      select: { id: true, scheduledDate: true },
    })
    expect(tx.attendanceRecord.createMany).toHaveBeenCalledWith({
      data: [
        { lessonId: 'lesson-2', studentId: 'student-1', status: 'ABSENT', recordedBy: null },
        { lessonId: 'lesson-1', studentId: 'student-2', status: 'ABSENT', recordedBy: null },
        { lessonId: 'lesson-2', studentId: 'student-2', status: 'ABSENT', recordedBy: null },
      ],
      skipDuplicates: true,
    })
  })

  it('does nothing when there is no target academic year', async () => {
    const tx = {
      lesson: { findMany: vi.fn() },
      attendanceRecord: { findMany: vi.fn(), createMany: vi.fn() },
    }

    await expect(
      backfillAttendanceForStudents(['student-1'], null, tx as never)
    ).resolves.toBe(0)
    expect(tx.lesson.findMany).not.toHaveBeenCalled()
  })

  it('handles a newly active production year with no recorded lessons', async () => {
    const tx = {
      lesson: { findMany: vi.fn().mockResolvedValue([]) },
      attendanceRecord: { findMany: vi.fn(), createMany: vi.fn() },
    }

    const studentIds = Array.from({ length: 39 }, (_, index) => `student-${index + 1}`)

    await expect(
      backfillAttendanceForStudents(studentIds, 'active-2026-2027', tx as never)
    ).resolves.toBe(0)
    expect(tx.attendanceRecord.findMany).not.toHaveBeenCalled()
    expect(tx.attendanceRecord.createMany).not.toHaveBeenCalled()
  })

  it('gives async students no default absence for lessons from the day they went async', async () => {
    const tx = {
      lesson: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'before', scheduledDate: new Date('2026-09-25T00:00:00Z') },
          { id: 'same-day', scheduledDate: new Date('2026-10-02T00:00:00Z') },
        ]),
      },
      studentEnrollment: {
        findMany: vi.fn().mockResolvedValue([
          { studentId: 'async-1', isAsyncStudent: true, asyncApprovedAt: new Date('2026-10-02T18:59:00Z') },
        ]),
      },
      attendanceRecord: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    await backfillAttendanceForStudents(['async-1'], 'active-year', tx as never)

    expect(tx.attendanceRecord.createMany).toHaveBeenCalledWith({
      data: [{ lessonId: 'before', studentId: 'async-1', status: 'ABSENT', recordedBy: null }],
      skipDuplicates: true,
    })
  })
})
