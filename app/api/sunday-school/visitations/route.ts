import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canReadPrivatePriestNotes } from '@/lib/priest-notes-access'
import { AttendanceStatus, AuditEventResult, RoleTag, SundaySchoolVisitationStatus } from "@prisma/client"
import { NextResponse } from "next/server"
import { getAuthorizationContext } from "@/lib/authorization"
import { handleApiError } from "@/lib/api-utils"
import { requireAuth } from "@/lib/auth-helpers"
import { notifyPriestNoteCreated } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"
import { getSundaySchoolAbsenceStreak } from "@/lib/sunday-school-absence-notifications"
import { FOLLOW_UP_ABSENT_WEEKS } from "@/lib/sunday-school-follow-up"
import {
  canServeClass,
  canViewClass,
  getSundaySchoolAccess,
  visibleClassFilter,
} from "@/lib/sunday-school-access"

// Sunday School mode: pastoral visitations for children in the actual ministry.
// This is unrelated to the prep-side Sunday School serving-verification flow.

// GET /api/sunday-school/visitations - List every visible class, its active
// children, and each child's visitation history.
export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    const access = await getSundaySchoolAccess(user)
    const authorization = await getAuthorizationContext(user.id)
    const session = await getServerSession(authOptions)
    const canReadPrivateNotes = canReadPrivatePriestNotes(authorization, Boolean(session?.impersonating))

    if (!access.canRead) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const classId = searchParams.get("classId")
    // ?view=follow-up: only children who need a call or visit, with just their
    // latest contact and no notes. Home and Care read this; Visits & calls reads it all.
    const followUpOnly = searchParams.get("view") === "follow-up"
    const allowedClassIds = visibleClassFilter(access)

    if (classId && !canViewClass(access, classId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const classes = await prisma.sundaySchoolClass.findMany({
      where: {
        academicYear: { isActive: true },
        isActive: true,
        ...(classId
          ? { id: classId }
          : allowedClassIds
            ? { id: { in: allowedClassIds } }
            : {}),
      },
      select: {
        id: true,
        name: true,
        level: true,
        children: {
          where: { isActive: true },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          select: {
            id: true,
            firstName: true,
            lastName: true,
            visitationPriority: true,
            visitations: followUpOnly
              ? {
                  where: { status: SundaySchoolVisitationStatus.DONE, ...(allowedClassIds ? { classId: { in: allowedClassIds } } : {}) },
                  orderBy: [{ createdAt: "desc" }],
                  take: 1,
                  select: { id: true, status: true, visitedAt: true, createdAt: true },
                }
              : {
                  ...(allowedClassIds ? { where: { classId: { in: allowedClassIds } } } : {}),
                  orderBy: [{ createdAt: "desc" }],
                  select: {
                    id: true,
                    status: true,
                    visitedAt: true,
                    notes: true,
                    createdAt: true,
                    updatedAt: true,
                    recorder: {
                      select: { id: true, name: true },
                    },
                  },
                },
            phoneCalls: followUpOnly
              ? {
                  ...(allowedClassIds ? { where: { classId: { in: allowedClassIds } } } : {}),
                  orderBy: [{ calledAt: "desc" }, { createdAt: "desc" }],
                  take: 1,
                  select: { id: true, calledAt: true, outcome: true },
                }
              : {
                  ...(allowedClassIds ? { where: { classId: { in: allowedClassIds } } } : {}),
                  orderBy: [{ calledAt: "desc" }, { createdAt: "desc" }],
                  select: {
                    id: true,
                    calledAt: true,
                    outcome: true,
                    note: true,
                    callerName: true,
                    createdAt: true,
                  },
                },
          },
        },
      },
      orderBy: [{ level: "asc" }, { name: "asc" }],
    })

    // Consecutive weeks each child was marked absent, for the Care follow-up list.
    const now = new Date()
    // Half a year is far longer than any streak worth acting on, and keeps the scan small.
    const since = new Date(now.getTime() - 26 * 7 * 24 * 60 * 60 * 1000)
    // Only absences matter: any other mark, or no mark, ends a streak.
    const sessions = classes.length === 0 ? [] : await prisma.sundaySchoolSession.findMany({
      where: { classId: { in: classes.map(classroom => classroom.id) }, date: { gte: since } },
      select: { classId: true, date: true, attendance: { where: { status: AttendanceStatus.ABSENT }, select: { childId: true } } },
    })
    const marks = new Map<string, Array<{ date: Date; status: AttendanceStatus }>>()
    for (const session of sessions) for (const record of session.attendance) {
      const key = `${session.classId}:${record.childId}`
      let history = marks.get(key)
      if (!history) marks.set(key, history = [])
      history.push({ date: session.date, status: AttendanceStatus.ABSENT })
    }

    return NextResponse.json({
      classes: classes.map((classroom) => ({
        ...classroom,
        canEdit: canServeClass(access, classroom.id),
        children: classroom.children
          .map((child) => {
            const { weeks, firstAbsenceDate } = getSundaySchoolAbsenceStreak(
              classroom.level, marks.get(`${classroom.id}:${child.id}`) ?? [], now, since,
            )
            return { ...child, absentStreak: { weeks, since: firstAbsenceDate } }
          })
          .filter((child) => !followUpOnly || child.visitationPriority || child.absentStreak.weeks >= FOLLOW_UP_ABSENT_WEEKS),
      })),
      standing: {
        readOnly: access.readOnly,
        isAdmin: access.isAdmin,
        isPriest: canReadPrivateNotes && authorization.roleTags.has(RoleTag.PRIEST),
        canReadPrivateNotes,
      },
    })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

// POST /api/sunday-school/visitations - Add one visitation record for a child.
// Body: { childId, status, visitedAt?, notes?, privateNote? }
export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const { childId, status, visitedAt, notes, privateNote } = body

    if (!childId) {
      return NextResponse.json({ error: "Child is required" }, { status: 400 })
    }
    if (!Object.values(SundaySchoolVisitationStatus).includes(status)) {
      return NextResponse.json({ error: "Choose whether the visitation was done" }, { status: 400 })
    }

    const noteText = typeof notes === "string" ? notes.trim() : ""
    if (noteText.length > 5000) {
      return NextResponse.json({ error: "Notes must be 5,000 characters or fewer" }, { status: 400 })
    }
    const privateNoteText = typeof privateNote === "string" ? privateNote.trim() : ""
    if (privateNoteText.length > 5000) {
      return NextResponse.json(
        { error: "Private notes must be 5,000 characters or fewer" },
        { status: 400 }
      )
    }

    const child = await prisma.sundaySchoolChild.findUnique({
      where: { id: childId },
      select: {
        id: true,
        classId: true,
        class: { select: { academicYearId: true } },
      },
    })

    if (!child) {
      return NextResponse.json({ error: "Child not found" }, { status: 404 })
    }
    if (!child.classId || !child.class) {
      return NextResponse.json({ error: "This child is not assigned to a class" }, { status: 400 })
    }
    const classId = child.classId

    const access = await getSundaySchoolAccess(user, child.class.academicYearId)
    if (!canServeClass(access, classId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    let visitDate: Date | null = null
    if (status === SundaySchoolVisitationStatus.DONE) {
      visitDate = visitedAt ? new Date(visitedAt) : new Date()
      if (Number.isNaN(visitDate.getTime())) {
        return NextResponse.json({ error: "Enter a valid visitation date" }, { status: 400 })
      }
      if (visitDate > new Date()) {
        return NextResponse.json({ error: "A completed visitation cannot be in the future" }, { status: 400 })
      }
    }

    const result = await prisma.$transaction(async tx => {
      const visitation = await tx.sundaySchoolVisitation.create({
        data: {
          childId: child.id,
          classId,
          status,
          visitedAt: visitDate,
          notes: noteText || null,
          recordedBy: user.id,
        },
        select: {
          id: true,
          status: true,
          visitedAt: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          recorder: {
            select: { id: true, name: true },
          },
        },
      })

      if (!privateNoteText) {
        return { visitation, priestNoteId: null }
      }

      const priestNote = await tx.sundaySchoolPriestNote.create({
        data: {
          visitationId: visitation.id,
          authorId: user.id,
          content: privateNoteText,
        },
        select: { id: true },
      })

      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          action: "sunday_school.priest_note.create",
          entityType: "SundaySchoolPriestNote",
          entityId: priestNote.id,
          result: AuditEventResult.SUCCESS,
          metadata: { visitationId: visitation.id, childId: child.id },
        },
      })

      return { visitation, priestNoteId: priestNote.id }
    })

    if (result.priestNoteId) {
      await notifyPriestNoteCreated({
        noteId: result.priestNoteId,
        visitationId: result.visitation.id,
        childId: child.id,
        submittedById: user.id,
      }).catch((error: unknown) => {
        console.error("Failed to alert priests about a confidential note", error)
      })
    }

    return NextResponse.json(result.visitation, { status: 201 })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

// PATCH: shared priority flag, independent of visitation completion/history.
export async function PATCH(request: Request) {
  try {
    const user = await requireAuth()
    const authorization = await getAuthorizationContext(user.id)
    if (authorization.disabled || authorization.readOnly) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const body = await request.json()
    if (!body || typeof body.childId !== "string" || !body.childId || typeof body.priority !== "boolean") {
      return NextResponse.json({ error: "Child and a boolean priority are required" }, { status: 400 })
    }
    const principal = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, role: true } })
    if (!principal) throw new Error("Unauthorized")
    const access = await getSundaySchoolAccess(principal)
    const child = await prisma.sundaySchoolChild.findUnique({
      where: { id: body.childId },
      select: { id: true, classId: true, isActive: true },
    })
    if (!child) return NextResponse.json({ error: "Child not found" }, { status: 404 })
    if (!child.isActive || !child.classId || !canServeClass(access, child.classId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    // Guard against a concurrent class transfer after authorization.
    const result = await prisma.sundaySchoolChild.updateMany({
      where: { id: child.id, classId: child.classId, isActive: true, class: { isActive: true, academicYear: { isActive: true } } },
      data: { visitationPriority: body.priority },
    })
    if (result.count !== 1) {
      return NextResponse.json({ error: "The roster changed. Refresh and try again." }, { status: 409 })
    }
    return NextResponse.json({ id: child.id, visitationPriority: body.priority })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
