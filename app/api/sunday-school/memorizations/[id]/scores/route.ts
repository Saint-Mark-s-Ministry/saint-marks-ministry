import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { getAuthorizationContext, scopeAllows, canWriteBusinessData } from '@/lib/authorization'
import { validateScoreRecords } from '@/lib/sunday-school-memorization'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const memorization = await prisma.sundaySchoolMemorization.findUnique({
      where: { id },
      select: { id: true, classId: true, archivedAt: true, class: { select: { sundaySchoolYearId: true } } },
    })
    if (!memorization) return NextResponse.json({ error: 'Memorization not found' }, { status: 404 })
    const access = await getAuthorizationContext(user.id, { sundaySchoolYearId: memorization.class.sundaySchoolYearId ?? undefined })
    if (!canWriteBusinessData(access) || !scopeAllows(access.sundaySchoolClassScope, memorization.classId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (memorization.archivedAt) {
      return NextResponse.json({ error: 'Archived memorizations cannot be scored' }, { status: 409 })
    }

    const body = await request.json()
    const parsed = validateScoreRecords(body.records)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const records = parsed.value

    const childIds = records.map(record => record.childId)
    const children = childIds.length > 0
      ? await prisma.sundaySchoolChild.findMany({
          where: { id: { in: childIds }, classId: memorization.classId, isActive: true },
          select: { id: true },
        })
      : []
    if (children.length !== childIds.length) {
      return NextResponse.json({ error: 'Every child must be active in this class' }, { status: 400 })
    }

    await prisma.$transaction(records.map(record =>
      record.score === null
        ? prisma.sundaySchoolMemorizationScore.deleteMany({
            where: { memorizationId: id, childId: record.childId },
          })
        : prisma.sundaySchoolMemorizationScore.upsert({
            where: { memorizationId_childId: { memorizationId: id, childId: record.childId } },
            update: { score: record.score, notes: record.notes, recordedById: user.id },
            create: {
              memorizationId: id,
              childId: record.childId,
              score: record.score,
              notes: record.notes,
              recordedById: user.id,
            },
          })
    ))
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
