import { AuditEventResult, RoleTag, SundaySchoolVisitationStatus } from "@prisma/client"
import { NextResponse } from "next/server"
import { getAuthorizationContext } from "@/lib/authorization"
import { handleApiError } from "@/lib/api-utils"
import { requireAuth } from "@/lib/auth-helpers"
import { notifyPriestNoteCreated } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"
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

    if (!access.canRead) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const classId = searchParams.get("classId")
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
            visitations: {
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
            phoneCalls: {
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

    return NextResponse.json({
      classes: classes.map((classroom) => ({
        ...classroom,
        canEdit: canServeClass(access, classroom.id),
      })),
      standing: {
        readOnly: access.readOnly,
        isAdmin: access.isAdmin,
        isPriest: authorization.roleTags.has(RoleTag.PRIEST),
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
