import { NextResponse } from 'next/server'
import { UserRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { canServeClass, getSundaySchoolAccess, visibleClassFilter } from '@/lib/sunday-school-access'
import {
  classBelongsToElementaryBand,
  getElementaryClass,
  getHomeworkDueDate,
  summarizeHomeworkStatuses,
  validateHomeworkResources,
} from '@/lib/sunday-school-homework'

const homeworkInclude = {
  resources: { orderBy: { sortOrder: 'asc' as const } },
  completions: {
    include: { child: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { child: { lastName: 'asc' as const } },
  },
} as const

function serializeWeek(
  week: Awaited<ReturnType<typeof loadWeeks>>[number],
  roster: Array<{ id: string; firstName: string; lastName: string }> = [],
  restrictToRoster = false,
) {
  const rosterIds = new Set(roster.map(child => child.id))
  const completions = (week.homework?.completions ?? []).filter(
    completion => !restrictToRoster || rosterIds.has(completion.childId),
  )
  const statusByChild = new Map(completions.map(completion => [completion.childId, completion.status]))
  const statuses = restrictToRoster
    ? roster.map(child => statusByChild.get(child.id) ?? null)
    : roster.length > 0
      ? [
          ...completions.map(completion => completion.status),
          ...roster.filter(child => !statusByChild.has(child.id)).map(() => null),
        ]
      : completions.map(completion => completion.status)

  return {
    weeklyLessonId: week.id,
    assignedDate: week.sundayDate,
    dueDate: getHomeworkDueDate(week.sundayDate),
    class: week.class,
    homework: week.homework ? {
      id: week.homework.id,
      title: week.homework.title,
      instructions: week.homework.instructions,
      archivedAt: week.homework.archivedAt,
      resources: week.homework.resources,
      completions: completions.map(completion => ({
        childId: completion.childId,
        child: completion.child,
        status: completion.status,
        updatedAt: completion.updatedAt,
      })),
      summary: summarizeHomeworkStatuses(statuses),
    } : null,
  }
}

async function loadWeeks(classIds: string[], includeArchived: boolean) {
  const weeks = await prisma.sundaySchoolWeeklyLesson.findMany({
    where: {
      classId: { in: classIds },
      class: {
        isActive: true,
        OR: [
          { sundaySchoolYear: { status: 'OPEN' } },
          { sundaySchoolYearId: null, academicYear: { isActive: true } },
        ],
      },
    },
    include: {
      class: { select: { id: true, name: true, level: true } },
      homework: {
        include: homeworkInclude,
      },
    },
    orderBy: [{ sundayDate: 'desc' }, { class: { name: 'asc' } }],
  })
  return weeks.map(week => ({
    ...week,
    homework: !includeArchived && week.homework?.archivedAt ? null : week.homework,
  }))
}

export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const requestedClassId = searchParams.get('classId')
    const includeArchived = searchParams.get('includeArchived') === 'true'
    const elementaryBands = await prisma.sundaySchoolAgeGroup.findMany({
      where: { isElementary: true, isActive: true },
      select: { sundaySchoolYearId: true, levels: true },
    })

    if (user.role === UserRole.PARENT) {
      const links = await prisma.sundaySchoolChildGuardian.findMany({
        where: { parentId: user.id, endedAt: null, child: { isActive: true, classId: { not: null } } },
        select: {
          child: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              classId: true,
              class: { select: { level: true, sundaySchoolYearId: true } },
            },
          },
        },
      })
      const children = links.map(link => link.child).filter(child =>
        child.classId && child.class && classBelongsToElementaryBand(child.class, elementaryBands)
      )
      const classIds = Array.from(new Set(children.flatMap(child => child.classId ? [child.classId] : [])))
      const weeks = await loadWeeks(classIds, false)
      const assignments = weeks
        .filter(week => week.homework)
        .map(week => serializeWeek(week, children.filter(child => child.classId === week.classId), true))
      return NextResponse.json({ eligible: children.length > 0, canManage: false, classes: [], roster: children, weeks: assignments })
    }

    if (user.role === UserRole.STUDENT) {
      const child = await prisma.sundaySchoolChild.findUnique({
        where: { userId: user.id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          classId: true,
          isActive: true,
          class: { select: { level: true, sundaySchoolYearId: true } },
        },
      })
      const eligible = Boolean(
        child?.isActive && child.classId && child.class && classBelongsToElementaryBand(child.class, elementaryBands)
      )
      const weeks = eligible && child?.classId ? await loadWeeks([child.classId], false) : []
      return NextResponse.json({
        eligible,
        canManage: false,
        classes: [],
        roster: child && eligible ? [child] : [],
        weeks: weeks.filter(week => week.homework).map(week => serializeWeek(week, child ? [child] : [], true)),
      })
    }

    const access = await getSundaySchoolAccess(user)
    if (!access.canRead) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const visibleIds = visibleClassFilter(access)
    const classes = await prisma.sundaySchoolClass.findMany({
      where: {
        isActive: true,
        ...(visibleIds ? { id: { in: visibleIds } } : {}),
        OR: [
          { sundaySchoolYear: { status: 'OPEN' } },
          { sundaySchoolYearId: null, academicYear: { isActive: true } },
        ],
      },
      select: { id: true, name: true, level: true, sundaySchoolYearId: true, academicYearId: true },
      orderBy: { name: 'asc' },
    })
    const eligibleClasses = classes.filter(cls => classBelongsToElementaryBand(cls, elementaryBands))
    if (requestedClassId && !eligibleClasses.some(cls => cls.id === requestedClassId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const selectedClasses = requestedClassId
      ? eligibleClasses.filter(cls => cls.id === requestedClassId)
      : eligibleClasses
    const classIds = selectedClasses.map(cls => cls.id)
    const roster = requestedClassId
      ? await prisma.sundaySchoolChild.findMany({
          where: { classId: requestedClassId, isActive: true },
          select: { id: true, firstName: true, lastName: true },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        })
      : []
    const weeks = await loadWeeks(classIds, includeArchived)

    return NextResponse.json({
      eligible: eligibleClasses.length > 0,
      canManage: selectedClasses.some(cls => canServeClass(access, cls.id)),
      classes: eligibleClasses.map(cls => ({
        id: cls.id,
        name: cls.name,
        level: cls.level,
        canEdit: canServeClass(access, cls.id),
      })),
      roster,
      weeks: weeks.map(week => serializeWeek(week, week.classId === requestedClassId ? roster : [])),
    })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    if (typeof body.weeklyLessonId !== 'string' || !body.weeklyLessonId) {
      return NextResponse.json({ error: 'Choose a homework week' }, { status: 400 })
    }
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) return NextResponse.json({ error: 'Homework title is required' }, { status: 400 })
    const validatedResources = validateHomeworkResources(body.resources ?? [])
    if (!validatedResources.ok) return NextResponse.json({ error: validatedResources.error }, { status: 400 })

    const lesson = await prisma.sundaySchoolWeeklyLesson.findUnique({
      where: { id: body.weeklyLessonId },
      select: { id: true, classId: true, class: { select: { academicYearId: true } }, homework: { select: { id: true } } },
    })
    if (!lesson) return NextResponse.json({ error: 'Homework week not found' }, { status: 404 })
    if (lesson.homework) return NextResponse.json({ error: 'Homework already exists for this week' }, { status: 409 })
    if (!await getElementaryClass(lesson.classId)) return NextResponse.json({ error: 'Homework is only available for Elementary classes' }, { status: 403 })
    const access = await getSundaySchoolAccess(user, lesson.class.academicYearId)
    if (!canServeClass(access, lesson.classId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const homework = await prisma.sundaySchoolHomework.create({
      data: {
        weeklyLessonId: lesson.id,
        title,
        instructions: typeof body.instructions === 'string' ? body.instructions.trim() || null : null,
        createdById: user.id,
        updatedById: user.id,
        resources: {
          create: validatedResources.resources.map((resource, sortOrder) => ({ ...resource, sortOrder })),
        },
      },
      include: homeworkInclude,
    })
    return NextResponse.json(homework, { status: 201 })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
