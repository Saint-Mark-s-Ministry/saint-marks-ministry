import { AuditEventResult, Prisma, RoleTag, UserRole } from '@prisma/client'
import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-utils'
import { getAuthorizationContext } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'
import { canServeClass, canViewClass, getSundaySchoolAccess, visibleClassFilter } from '@/lib/sunday-school-access'
import { getCheckInWeek } from '@/lib/sunday-school-check-ins'

// Sunday School mode: shared child check-in responsibility, unrelated to Prep.
// Reuse the active legacy class/year resolver during the compatibility rollout.
async function resolveViewer(userId: string) {
  const authorization = await getAuthorizationContext(userId)
  if (authorization.disabled) throw new Error('Forbidden')
  const principal = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } })
  if (!principal) throw new Error('Unauthorized')
  const access = await getSundaySchoolAccess(principal)
  if (!access.canRead) throw new Error('Forbidden')
  const readOnly = authorization.readOnly || authorization.roleTags.has(RoleTag.PRIEST) || principal.role === UserRole.PRIEST
  return { access, readOnly }
}

export const GET = withAuth(async (user, request: Request) => {
  const { access, readOnly } = await resolveViewer(user.id)
  const classId = new URL(request.url).searchParams.get('classId')
  if (classId && !canViewClass(access, classId)) throw new Error('Forbidden')
  const visible = visibleClassFilter(access)
  const classes = await prisma.sundaySchoolClass.findMany({
    where: {
      isActive: true, academicYear: { isActive: true },
      ...(classId ? { id: classId } : visible ? { id: { in: visible } } : {}),
    },
    orderBy: [{ level: 'asc' }, { name: 'asc' }],
    select: {
      id: true, name: true, academicYearId: true,
      children: {
        where: { isActive: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: { id: true, firstName: true, lastName: true, followUpAssignmentId: true },
      },
    },
  })
  const classIds = classes.map(cls => cls.id)
  const { start, end, today } = getCheckInWeek()
  const [assignments, calls] = classIds.length ? await Promise.all([
    prisma.sundaySchoolServantAssignment.findMany({
      where: { classId: { in: classIds }, endedAt: null, user: { isDisabled: false } },
      select: { id: true, classId: true, academicYearId: true, user: { select: { id: true, name: true } } },
      orderBy: { user: { name: 'asc' } },
    }),
    prisma.sundaySchoolPhoneCall.findMany({
      where: { classId: { in: classIds }, calledAt: { gte: start, lt: end, lte: today } },
      orderBy: [{ calledAt: 'desc' }, { createdAt: 'desc' }],
      select: { classId: true, childId: true, calledAt: true, outcome: true },
    }),
  ]) : [[], []]
  const latestCalls = new Map<string, (typeof calls)[number]>()
  for (const call of calls) {
    const key = `${call.classId}:${call.childId}`
    if (!latestCalls.has(key)) latestCalls.set(key, call)
  }
  return NextResponse.json({
    viewerId: user.id, weekOf: start.toISOString().slice(0, 10),
    classes: classes.map(cls => {
      const team = assignments.filter(a => a.classId === cls.id && a.academicYearId === cls.academicYearId)
      return {
        id: cls.id, name: cls.name, canAssign: !readOnly && canServeClass(access, cls.id),
        servants: team.map(a => ({ assignmentId: a.id, userId: a.user.id, name: a.user.name })),
        children: cls.children.map(child => {
          // Ended/disabled staffing, transfers, and year rollover never carry responsibility forward.
          const assignment = team.find(a => a.id === child.followUpAssignmentId)
          const call = latestCalls.get(`${cls.id}:${child.id}`)
          return {
            id: child.id, firstName: child.firstName, lastName: child.lastName,
            assignmentId: assignment?.id ?? null,
            assignee: assignment ? { id: assignment.user.id, name: assignment.user.name } : null,
            callThisWeek: call ? { calledAt: call.calledAt, outcome: call.outcome } : null,
          }
        }),
      }
    }),
  })
})

export const PUT = withAuth(async (user, request: Request) => {
  const { access, readOnly } = await resolveViewer(user.id)
  if (readOnly) throw new Error('Forbidden')
  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Choose a child and servant' }, { status: 400 })
  }
  const { childId, assignmentId } = body as Record<string, unknown>
  if (typeof childId !== 'string' || !childId.trim() ||
      (assignmentId !== null && (typeof assignmentId !== 'string' || !assignmentId.trim()))) {
    return NextResponse.json({ error: 'Choose a child and servant, or clear the assignment' }, { status: 400 })
  }
  try {
    return await prisma.$transaction(async tx => {
      const child = await tx.sundaySchoolChild.findUnique({
        where: { id: childId },
        select: { id: true, classId: true, isActive: true, class: { select: { isActive: true, academicYearId: true, academicYear: { select: { isActive: true } } } } },
      })
      if (!child) return NextResponse.json({ error: 'Child not found' }, { status: 404 })
      if (!child.isActive || !child.classId || !child.class?.isActive || !child.class.academicYear.isActive || !canServeClass(access, child.classId)) {
        throw new Error('Forbidden')
      }
      if (assignmentId !== null) {
        const target = await tx.sundaySchoolServantAssignment.findFirst({
          where: { id: assignmentId, classId: child.classId, academicYearId: child.class.academicYearId, endedAt: null, user: { isDisabled: false } },
          select: { id: true },
        })
        if (!target) return NextResponse.json({ error: 'Choose an active servant from this class' }, { status: 400 })
      }
      // Serializable reads protect staffing/roster changes during reassignment.
      const saved = await tx.sundaySchoolChild.updateMany({
        where: { id: child.id, classId: child.classId, isActive: true },
        data: { followUpAssignmentId: assignmentId },
      })
      if (saved.count !== 1) return NextResponse.json({ error: 'The roster changed. Refresh and try again.' }, { status: 409 })
      await tx.auditEvent.create({
        data: {
          actorUserId: user.id, action: 'sunday_school.child_follow_up.assign',
          entityType: 'SundaySchoolChild', entityId: child.id, result: AuditEventResult.SUCCESS,
          metadata: { classId: child.classId, assignmentId },
        },
      })
      return NextResponse.json({ id: child.id, assignmentId })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return NextResponse.json({ error: 'The roster or staffing changed. Refresh and try again.' }, { status: 409 })
    }
    throw error
  }
})
