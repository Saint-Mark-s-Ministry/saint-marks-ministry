import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireAuth } from '@/lib/auth-helpers'
import { getAuthorizationContext } from '@/lib/authorization'
import { canReadPrivatePriestNotes } from '@/lib/priest-notes-access'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { isServantsPrepStudent, servantsPrepStudentStatusSelect } from '@/lib/sunday-school-child-account'
import { getSundaySchoolAccess, visibleClassFilter } from '@/lib/sunday-school-access'
import { loadChildForUser } from '@/lib/sunday-school-child-access'
import { calculateAttendanceFromRecords, countAttendanceStatuses } from '@/lib/attendance-utils'
import type { StudentHistory } from '@/lib/student-history'

// Sunday School ministry only. Historical records retain their own class scope.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const principal = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, isDisabled: true } })
    if (!principal || principal.isDisabled) throw new Error('Forbidden')
    const access = await getSundaySchoolAccess(principal)
    if (!access.canRead) throw new Error('Forbidden')
    await loadChildForUser(id, access, false)
    const [authorization, session] = await Promise.all([getAuthorizationContext(user.id), getServerSession(authOptions)])
    if (authorization.disabled) throw new Error('Forbidden')
    const allowedClassIds = visibleClassFilter(access)
    const classScope = allowedClassIds === undefined ? {} : { classId: { in: allowedClassIds } }
    const child = await prisma.sundaySchoolChild.findUnique({
      where: { id },
      select: {
        id: true, firstName: true, lastName: true, notes: true,
        user: { select: servantsPrepStudentStatusSelect },
        class: { select: { name: true } },
        attendance: {
          where: { session: classScope },
          select: { id: true, status: true, notes: true, session: { select: { date: true, topic: true, class: { select: { name: true } } } } },
          orderBy: [{ session: { date: 'desc' } }, { id: 'desc' }],
        },
        visitations: {
          where: classScope,
          select: { id: true, status: true, visitedAt: true, createdAt: true, notes: true, recorder: { select: { name: true } } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
        phoneCalls: {
          where: classScope,
          select: { id: true, calledAt: true, outcome: true, note: true, callerName: true },
          orderBy: [{ calledAt: 'desc' }, { id: 'desc' }],
        },
      },
    })
    if (!child) throw new Error('Not found')
    const result: StudentHistory = {
      id: child.id, name: `${child.firstName} ${child.lastName}`, program: 'sunday-school',
      isServantsPrepStudent: isServantsPrepStudent(child.user),
      subtitle: `Sunday School · ${child.class?.name ?? 'Unassigned'}`,
      canReadPrivateNotes: canReadPrivatePriestNotes(authorization, Boolean(session?.impersonating)),
      attendance: {
        kind: 'meetings', counts: countAttendanceStatuses(child.attendance), rate: calculateAttendanceFromRecords(child.attendance),
        records: child.attendance.map(record => ({
          id: record.id, date: record.session.date.toISOString(), status: record.status, notes: record.notes,
          title: [record.session.class.name, record.session.topic].filter(Boolean).join(' · '),
          notApplicable: false, excluded: false,
        })),
      },
      notes: { general: child.notes, entries: [] },
      visitations: child.visitations.map(visit => ({ ...visit, visitedAt: visit.visitedAt?.toISOString() ?? null, createdAt: visit.createdAt.toISOString() })),
      phoneCalls: child.phoneCalls.map(call => ({ ...call, calledAt: call.calledAt.toISOString() })),
    }
    // Confidential notes deliberately stay behind /priest-notes' separate checks.
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
