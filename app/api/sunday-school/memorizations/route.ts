import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { getAuthorizationContext, scopeIdWhere, scopeAllows, canWriteBusinessData } from '@/lib/authorization'
import { validateMemorizationInput } from '@/lib/sunday-school-memorization'

// Sunday School mode only. Authority is assignment-based and re-derived here.

const openClassFilter = {
  isActive: true,
  OR: [
    { sundaySchoolYear: { status: 'OPEN' as const } },
    { sundaySchoolYearId: null, academicYear: { isActive: true } },
  ],
}

export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    const access = await getAuthorizationContext(user.id)
    if (access.disabled) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const requestedClassId = searchParams.get('classId')
    const includeArchived = searchParams.get('includeArchived') === 'true'
    const visibleIds = scopeIdWhere(access.sundaySchoolClassScope)

    const classes = await prisma.sundaySchoolClass.findMany({
      where: { ...openClassFilter, ...visibleIds },
      select: { id: true, name: true, level: true },
      orderBy: { name: 'asc' },
    })
    const classOptions = classes.map(cls => ({ ...cls, canEdit: canWriteBusinessData(access) && scopeAllows(access.sundaySchoolClassScope, cls.id) }))

    if (!requestedClassId) {
      return NextResponse.json({ classes: classOptions, roster: [], memorizations: [] })
    }
    if (!classes.some(cls => cls.id === requestedClassId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [roster, memorizations] = await Promise.all([
      prisma.sundaySchoolChild.findMany({
        where: { classId: requestedClassId, isActive: true },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      prisma.sundaySchoolMemorization.findMany({
        where: { classId: requestedClassId, ...(includeArchived ? {} : { archivedAt: null }) },
        include: {
          scores: { select: { childId: true, score: true, notes: true, updatedAt: true } },
        },
        orderBy: [{ dueDate: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      }),
    ])

    return NextResponse.json({ classes: classOptions, roster, memorizations })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    if (typeof body.classId !== 'string' || !body.classId) {
      return NextResponse.json({ error: 'Choose a class' }, { status: 400 })
    }
    const parsed = validateMemorizationInput(body)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const cls = await prisma.sundaySchoolClass.findUnique({
      where: { id: body.classId },
      select: { id: true, sundaySchoolYearId: true },
    })
    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    const access = await getAuthorizationContext(user.id, { sundaySchoolYearId: cls.sundaySchoolYearId ?? undefined })
    if (!canWriteBusinessData(access) || !scopeAllows(access.sundaySchoolClassScope, cls.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const memorization = await prisma.sundaySchoolMemorization.create({
      data: { classId: cls.id, ...parsed.value, createdById: user.id },
      include: { scores: true },
    })
    return NextResponse.json(memorization, { status: 201 })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
