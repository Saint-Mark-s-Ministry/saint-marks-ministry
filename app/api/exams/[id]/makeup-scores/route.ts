import { NextResponse } from 'next/server'
import { RoleTag } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { getAuthorizationContext, assertCanWriteBusinessData } from '@/lib/authorization'
import { handleApiError } from '@/lib/api-utils'
import { makeupToday } from '@/lib/makeup-exams'
import { parseMakeupScoreInput, effectiveExamResult } from '@/lib/makeup-scores'
import { examScoreTransaction } from '@/lib/exam-score-service'

type Context = { params: Promise<{ id: string }> }
async function authorize(write = false) {
  const user = await requireAuth()
  const context = await getAuthorizationContext(user.id)
  if (context.disabled || ![RoleTag.SUPER_ADMIN, RoleTag.SERVANTS_PREP_SERVANT, RoleTag.PRIEST].some(tag => context.roleTags.has(tag))) throw new Error('Forbidden')
  if (write) assertCanWriteBusinessData(context)
  return user
}

export async function GET(_request: Request, { params }: Context) {
  try {
    await authorize()
    const { id } = await params
    const exam = await prisma.exam.findUnique({ where: { id }, include: { examSection: true } })
    if (!exam) throw new Error('Not found')
    const [scores, enrollments] = await Promise.all([
      prisma.examScore.findMany({ where: { examId: id }, include: { student: { select: { id: true, name: true } }, makeupScores: { orderBy: { takenDate: 'desc' } } } }),
      prisma.studentEnrollment.findMany({ where: { isActive: true, status: 'ACTIVE', ...(exam.yearLevel === 'YEAR_2' ? { yearLevel: 'YEAR_2' } : {}) }, select: { student: { select: { id: true, name: true } } } }),
    ])
    const people = new Map(enrollments.map(row => [row.student.id, row.student]))
    scores.filter(row => row.makeupScores.length).forEach(row => people.set(row.student.id, row.student))
    return NextResponse.json({ exam, students: Array.from(people.values()).sort((a, b) => a.name.localeCompare(b.name)).map(student => {
      const result = scores.find(row => row.studentId === student.id)
      return { ...student, originalPercentage: result?.originalPercentage ?? null, effectivePercentage: result?.percentage ?? null, attempts: result?.makeupScores ?? [] }
    }) })
  } catch (error) { return handleApiError(error) }
}

async function save(request: Request, { params }: Context, editing: boolean) {
  try {
    const user = await authorize(true)
    const { id } = await params
    const input = parseMakeupScoreInput(await request.json().catch(() => null))
    if (typeof input === 'string') return NextResponse.json({ error: input }, { status: 400 })
    if (editing && !input.attemptId) return NextResponse.json({ error: 'Choose a makeup score to edit.' }, { status: 400 })
    const result = await examScoreTransaction(async tx => {
      const exam = await tx.exam.findUnique({ where: { id }, include: { examSection: true } })
      if (!exam) throw new Error('Not found')
      if (input.takenDate < exam.examDate.toISOString().slice(0, 10)) return null
      let record = await tx.examScore.findUnique({ where: { examId_studentId: { examId: id, studentId: input.studentId } }, include: { makeupScores: true } })
      if (editing) {
        if (!record?.makeupScores.some(attempt => attempt.id === input.attemptId)) throw new Error('Not found')
      } else {
        const enrollment = await tx.studentEnrollment.findUnique({ where: { studentId: input.studentId } })
        if (!enrollment?.isActive || enrollment.status !== 'ACTIVE' || (exam.yearLevel === 'YEAR_2' && enrollment.yearLevel !== 'YEAR_2')) return null
        if (exam.examDate.toISOString().slice(0, 10) >= makeupToday()) return null
        if (record && record.percentage >= exam.examSection.passingScore) return null
      }
      const percentage = input.score / input.totalPoints * 100
      if (!record) record = await tx.examScore.create({ data: { examId: id, studentId: input.studentId, score: percentage * exam.totalPoints / 100, percentage, gradedBy: user.id }, include: { makeupScores: true } })
      const data = { version: input.version, score: input.score, totalPoints: input.totalPoints, percentage, takenDate: new Date(`${input.takenDate}T00:00:00Z`), notes: input.notes, gradedBy: user.id }
      const attempt = editing
        ? await tx.makeupExamScore.update({ where: { id: input.attemptId }, data })
        : await tx.makeupExamScore.create({ data: { ...data, examScoreId: record.id } })
      const attempts = await tx.makeupExamScore.findMany({ where: { examScoreId: record.id }, select: { percentage: true } })
      const effective = effectiveExamResult(record.originalPercentage, attempts.map(row => row.percentage), exam.totalPoints, record.digitalRetakePercentage)
      await tx.examScore.update({ where: { id: record.id }, data: effective })
      return attempt
    })
    if (!result) return NextResponse.json({ error: 'This student must have an active enrollment and a failed or missed exam to record a new makeup score.' }, { status: 400 })
    return NextResponse.json(result, { status: editing ? 200 : 201 })
  } catch (error) { return handleApiError(error) }
}
export async function POST(request: Request, context: Context) { return save(request, context, false) }
export async function PATCH(request: Request, context: Context) { return save(request, context, true) }
