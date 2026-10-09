import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-utils'
import { effectiveExamResult } from '@/lib/makeup-scores'
import { examScoreTransaction, requireExamScoreWriter } from '@/lib/exam-score-service'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireExamScoreWriter()
    const { id } = await params
    const body = await request.json().catch(() => null)
    if (!body || typeof body.score !== 'number' || !Number.isFinite(body.score) || body.score < 0 || (body.notes !== undefined && body.notes !== null && typeof body.notes !== 'string')) return NextResponse.json({ error: 'Enter a valid nonnegative score and text notes.' }, { status: 400 })
    const result = await examScoreTransaction(async tx => {
      const record = await tx.examScore.findUnique({ where: { id }, include: { exam: true, makeupScores: true } })
      if (!record) throw new Error('Not found')
      if (body.score > record.exam.totalPoints) return null
      const originalPercentage = body.score / record.exam.totalPoints * 100
      const effective = effectiveExamResult(originalPercentage, record.makeupScores.map(attempt => attempt.percentage), record.exam.totalPoints, record.digitalRetakePercentage)
      return tx.examScore.update({ where: { id }, data: { originalScore: body.score, originalPercentage, ...effective, gradedBy: user.id, ...(body.notes !== undefined ? { notes: body.notes || null } : {}) }, include: { student: { select: { id: true, name: true } } } })
    })
    if (!result) return NextResponse.json({ error: 'Score cannot exceed the exam total points.' }, { status: 400 })
    return NextResponse.json(result)
  } catch (error) { return handleApiError(error) }
}
