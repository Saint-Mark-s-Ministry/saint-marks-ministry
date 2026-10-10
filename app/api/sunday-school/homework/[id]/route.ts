import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { canServeClass, getSundaySchoolAccess } from '@/lib/sunday-school-access'
import { getElementaryClass, validateHomeworkResources } from '@/lib/sunday-school-homework'

async function editableHomework(id: string, user: { id: string; role: import('@prisma/client').UserRole }) {
  const homework = await prisma.sundaySchoolHomework.findUnique({
    where: { id },
    include: { weeklyLesson: { include: { class: { select: { academicYearId: true } } } } },
  })
  if (!homework) return { error: NextResponse.json({ error: 'Homework not found' }, { status: 404 }) }
  if (!await getElementaryClass(homework.weeklyLesson.classId)) {
    return { error: NextResponse.json({ error: 'Homework is only available for Elementary classes' }, { status: 403 }) }
  }
  const access = await getSundaySchoolAccess(user, homework.weeklyLesson.class.academicYearId)
  if (!canServeClass(access, homework.weeklyLesson.classId)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { homework }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const result = await editableHomework(id, user)
    if ('error' in result) return result.error
    const body = await request.json()
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) return NextResponse.json({ error: 'Homework title is required' }, { status: 400 })
    const validatedResources = validateHomeworkResources(body.resources ?? [])
    if (!validatedResources.ok) return NextResponse.json({ error: validatedResources.error }, { status: 400 })

    const updated = await prisma.$transaction(async tx => {
      await tx.sundaySchoolHomework.update({
        where: { id },
        data: {
          title,
          instructions: typeof body.instructions === 'string' ? body.instructions.trim() || null : null,
          archivedAt: null,
          updatedById: user.id,
        },
      })
      await tx.sundaySchoolHomeworkResource.deleteMany({ where: { homeworkId: id } })
      if (validatedResources.resources.length > 0) {
        await tx.sundaySchoolHomeworkResource.createMany({
          data: validatedResources.resources.map((resource, sortOrder) => ({ homeworkId: id, ...resource, sortOrder })),
        })
      }
      return tx.sundaySchoolHomework.findUniqueOrThrow({
        where: { id },
        include: { resources: { orderBy: { sortOrder: 'asc' } } },
      })
    })
    return NextResponse.json(updated)
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const result = await editableHomework(id, user)
    if ('error' in result) return result.error
    const archived = await prisma.sundaySchoolHomework.update({
      where: { id },
      data: { archivedAt: new Date(), updatedById: user.id },
    })
    return NextResponse.json(archived)
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
