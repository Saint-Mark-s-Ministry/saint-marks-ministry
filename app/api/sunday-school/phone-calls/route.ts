import { AuditEventResult, SundaySchoolPhoneCallOutcome } from '@prisma/client'
import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-utils'
import { requireAuth } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { canServeClass, getSundaySchoolAccess } from '@/lib/sunday-school-access'

// Sunday School mode: a call is follow-up contact, never a visitation.
export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Enter the call details' }, { status: 400 })
    }

    const { childId, calledAt, outcome, note } = body as Record<string, unknown>
    if (typeof childId !== 'string' || !childId.trim()) {
      return NextResponse.json({ error: 'Child is required' }, { status: 400 })
    }
    if (typeof calledAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(calledAt)) {
      return NextResponse.json({ error: 'Enter a valid call date' }, { status: 400 })
    }
    const callDate = new Date(`${calledAt}T00:00:00.000Z`)
    if (Number.isNaN(callDate.getTime()) || callDate.toISOString().slice(0, 10) !== calledAt) {
      return NextResponse.json({ error: 'Enter a valid call date' }, { status: 400 })
    }
    if (calledAt > new Date().toISOString().slice(0, 10)) {
      return NextResponse.json({ error: 'A call cannot be dated in the future' }, { status: 400 })
    }
    if (!Object.values(SundaySchoolPhoneCallOutcome).includes(outcome as SundaySchoolPhoneCallOutcome)) {
      return NextResponse.json({ error: 'Choose a call outcome' }, { status: 400 })
    }
    const noteText = typeof note === 'string' ? note.trim() : ''
    if (!noteText || noteText.length > 500) {
      return NextResponse.json({ error: 'Enter a note of 500 characters or fewer' }, { status: 400 })
    }

    const child = await prisma.sundaySchoolChild.findUnique({
      where: { id: childId },
      select: {
        id: true,
        isActive: true,
        classId: true,
        class: {
          select: {
            isActive: true,
            academicYearId: true,
            academicYear: { select: { isActive: true } },
          },
        },
      },
    })
    if (!child || !child.isActive) {
      return NextResponse.json({ error: 'Child not found' }, { status: 404 })
    }
    if (!child.classId || !child.class?.isActive || !child.class.academicYear.isActive) {
      return NextResponse.json({ error: 'This child is not in an active class' }, { status: 400 })
    }
    const classId = child.classId

    const access = await getSundaySchoolAccess(user, child.class.academicYearId)
    if (!canServeClass(access, classId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const call = await prisma.$transaction(async tx => {
      const saved = await tx.sundaySchoolPhoneCall.create({
        data: {
          childId: child.id,
          classId,
          callerId: user.id,
          callerName: user.name?.trim() || 'Unknown servant',
          calledAt: callDate,
          outcome: outcome as SundaySchoolPhoneCallOutcome,
          note: noteText,
        },
        select: {
          id: true,
          calledAt: true,
          outcome: true,
          note: true,
          callerName: true,
          createdAt: true,
        },
      })
      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          action: 'sunday_school.phone_call.create',
          entityType: 'SundaySchoolPhoneCall',
          entityId: saved.id,
          result: AuditEventResult.SUCCESS,
          metadata: { childId: child.id, classId },
        },
      })
      return saved
    })

    return NextResponse.json(call, { status: 201 })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
