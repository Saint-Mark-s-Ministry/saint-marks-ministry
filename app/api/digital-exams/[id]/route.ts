import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { examAccess, examApiError, examSummarySelect, eligibleForExam, mutateExam, publicAttempt } from '@/lib/digital-exam-service'
import { examPusher } from '@/lib/exam-realtime'
import { staleContact } from '@/lib/digital-exams'

type Context = { params: Promise<{ id: string }> }
export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params
    const access = await examAccess()
    const exam = await prisma.exam.findUnique({ where: { id }, select: { ...examSummarySelect, academicYearId: true, academicYear: { select: { name: true, startDate: true, isActive: true } } } })
    if (!exam) throw new Error('Not found')
    if (!access.staff && !await eligibleForExam(prisma, access.user.id, exam)) throw new Error('Forbidden')
    const sheet = await prisma.digitalExamSheet.findUnique({ where: { examId: id } })
    const safeSheet = sheet ? { state: sheet.state, choiceCounts: sheet.choiceCounts, openedAt: sheet.openedAt, closedAt: sheet.closedAt, releasedAt: sheet.releasedAt } : null
    if (!access.staff) {
      if (!sheet || sheet.state !== 'OPEN' || (sheet.releasedAt && !await prisma.digitalExamAttempt.findFirst({ where: { examId: id, studentId: access.user.id, attemptNumber: { gt: 1 } }, select: { id: true } }))) throw new Error('Not found')
      const attempt = await prisma.digitalExamAttempt.findUnique({ where: { examId_studentId: { examId: id, studentId: access.user.id } } })
      return NextResponse.json({ exam, sheet: safeSheet, attempt: publicAttempt(attempt, !!attempt?.resultReleasedAt) }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const [enrollments, attempts, scores] = await Promise.all([
      prisma.studentEnrollment.findMany({
        where: { isActive: true, status: 'ACTIVE', yearLevel: exam.yearLevel === 'BOTH' ? undefined : exam.yearLevel,
          OR: [{ academicYear: { startDate: { lte: exam.academicYear.startDate } } }, ...(exam.academicYear.isActive ? [{ academicYearId: null }] : [])],
          student: { isDisabled: false, roleAssignments: { some: { tag: 'SERVANTS_PREP_STUDENT', revokedAt: null } } },
        },
        select: { student: { select: { id: true, name: true } } },
      }),
      prisma.digitalExamAttempt.findMany({ where: { examId: id }, include: { archives: { orderBy: { attemptNumber: 'asc' } }, student: { select: { id: true, name: true } }, events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, kind: true, createdAt: true, clientAt: true, actorId: true, attemptNumber: true, questionNumber: true, answerChoice: true, destinationPath: true } } } }),
      prisma.examScore.findMany({ where: { examId: id }, select: { studentId: true } }),
    ])
    const graded = new Set(scores.map(score => score.studentId))
    const currentEligible = (studentId: string) => {
      const attempt = attempts.find(a => a.studentId === studentId)
      return attempt?.attemptNumber && attempt.attemptNumber > 1 && !attempt.resultReleasedAt || !sheet?.releasedAt && !graded.has(studentId)
    }
    const roster = new Map(enrollments.filter(e => currentEligible(e.student.id)).map(e => [e.student.id, { student: e.student, eligible: true }]))
    for (const attempt of attempts) if (currentEligible(attempt.studentId) && !roster.has(attempt.studentId)) roster.set(attempt.studentId, { student: attempt.student, eligible: false })
    return NextResponse.json({ exam, sheet: safeSheet, answerKey: access.manage ? sheet?.answerKey : undefined, canManage: access.manage, realtimeConfigured: !!examPusher(),
      hasAttempts: attempts.length > 0,
      pendingResults: attempts.filter(a => a.state === 'SUBMITTED' && !a.resultReleasedAt).length,
      retakeCandidates: access.manage ? enrollments.filter(e => { const a = attempts.find(a => a.studentId === e.student.id); return (!a || a.state === 'SUBMITTED') && (graded.has(e.student.id) || a?.state === 'SUBMITTED') }).map(e => e.student) : undefined,
      completedHistory: attempts.flatMap(attempt => [
        ...attempt.archives.map(archive => ({ student: attempt.student, attemptNumber: archive.attemptNumber, snapshot: archive.snapshot, events: attempt.events.filter(e => e.attemptNumber === archive.attemptNumber) })),
        ...(attempt.resultReleasedAt || graded.has(attempt.studentId) && attempt.attemptNumber === 1 ? [{ student: attempt.student, attemptNumber: attempt.attemptNumber, snapshot: publicAttempt(attempt, true), events: attempt.events.filter(e => e.attemptNumber === attempt.attemptNumber) }] : []),
      ]),
      roster: [...roster.values()].map(row => {
        const attempt = attempts.find(a => a.studentId === row.student.id)
        return { ...row, attempt: attempt ? { ...publicAttempt(attempt, true), stale: staleContact(attempt.lastSeenAt), pageVisible: attempt.pageVisible, events: attempt.events.filter(e => e.attemptNumber === attempt.attemptNumber), answeredCount: attempt.answers.filter(Boolean).length } : null }
      }),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return examApiError(error) }
}
export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params
    const access = await examAccess()
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'An exam action is required.' }, { status: 400 })
    return NextResponse.json(await mutateExam(id, body, access), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return examApiError(error) }
}
