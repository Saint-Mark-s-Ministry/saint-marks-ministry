import { NextResponse } from 'next/server'
import { examAccess, examApiError, lockedExam } from '@/lib/digital-exam-service'
import { ExamError } from '@/lib/digital-exams'

// Only empty exams can be deleted. Resetting a test opening preserves grades.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await examAccess()
    if (!access.manage) throw new Error('Forbidden')
    const { id } = await params
    await lockedExam(id, async tx => {
      const scores = await tx.examScore.count({ where: { examId: id } })
      const attempts = await tx.digitalExamAttempt.count({ where: { examId: id } })
      if (scores || attempts) throw new ExamError('This exam has saved grades or student attempts and cannot be deleted. To undo an empty test opening, use Reset test opening in Exam Monitoring.', 409)
      await tx.exam.delete({ where: { id } })
    })
    return NextResponse.json({ message: 'Exam deleted successfully' })
  } catch (error) { return examApiError(error) }
}
