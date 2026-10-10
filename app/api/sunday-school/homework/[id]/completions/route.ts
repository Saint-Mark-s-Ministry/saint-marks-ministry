import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { canServeClass, getSundaySchoolAccess } from '@/lib/sunday-school-access'
import { getElementaryClass, isHomeworkCompletionStatus } from '@/lib/sunday-school-homework'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const homework = await prisma.sundaySchoolHomework.findUnique({
      where: { id },
      include: { weeklyLesson: { include: { class: { select: { academicYearId: true } } } } },
    })
    if (!homework) return NextResponse.json({ error: 'Homework not found' }, { status: 404 })
    if (!await getElementaryClass(homework.weeklyLesson.classId)) {
      return NextResponse.json({ error: 'Homework is only available for Elementary classes' }, { status: 403 })
    }
    const access = await getSundaySchoolAccess(user, homework.weeklyLesson.class.academicYearId)
    if (!canServeClass(access, homework.weeklyLesson.classId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    if (!Array.isArray(body.records)) return NextResponse.json({ error: 'Records must be an array' }, { status: 400 })
    const records = body.records as Array<{ childId?: unknown; status?: unknown }>
    if (records.some(record => typeof record.childId !== 'string' || (record.status !== null && !isHomeworkCompletionStatus(record.status)))) {
      return NextResponse.json({ error: 'Each record needs a valid child and status' }, { status: 400 })
    }
    const childIds = Array.from(new Set(records.map(record => record.childId as string)))
    if (childIds.length !== records.length) return NextResponse.json({ error: 'Each child may appear only once' }, { status: 400 })
    const children = childIds.length > 0 ? await prisma.sundaySchoolChild.findMany({
      where: { id: { in: childIds }, classId: homework.weeklyLesson.classId, isActive: true },
      select: { id: true },
    }) : []
    if (children.length !== childIds.length) {
      return NextResponse.json({ error: 'Every child must be active in the selected class' }, { status: 400 })
    }

    await prisma.$transaction(records.map(record => {
      const childId = record.childId as string
      if (record.status === null) {
        return prisma.sundaySchoolHomeworkCompletion.deleteMany({ where: { homeworkId: id, childId } })
      }
      if (!isHomeworkCompletionStatus(record.status)) {
        throw new Error('Invalid homework completion status')
      }
      return prisma.sundaySchoolHomeworkCompletion.upsert({
        where: { homeworkId_childId: { homeworkId: id, childId } },
        update: { status: record.status, recordedById: user.id },
        create: { homeworkId: id, childId, status: record.status, recordedById: user.id },
      })
    }))

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
