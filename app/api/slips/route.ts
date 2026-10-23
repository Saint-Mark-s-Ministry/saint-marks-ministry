import { NextResponse } from "next/server"
import { put, del } from "@vercel/blob"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { AttendanceStatus, LessonStatus, SlipType } from "@prisma/client"
import { isAdmin, canManageData } from "@/lib/roles"
import { handleApiError } from "@/lib/api-utils"
import { blobUploadTarget } from "@/lib/blob-upload"

const ALLOWED_FILE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "application/pdf"]
const MAX_FILE_SIZE = 4.5 * 1024 * 1024 // Vercel's server upload limit

const isSlipType = (value: unknown): value is SlipType => Object.values(SlipType).includes(value as SlipType)

// GET /api/slips?type=ATTENDANCE|CONFESSION&studentId=xxx - List uploaded slips (admins)
export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    if (!isAdmin(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type")
    const studentId = searchParams.get("studentId")

    const slips = await prisma.studentSlip.findMany({
      where: {
        ...(isSlipType(type) ? { type } : {}),
        ...(studentId ? { studentId } : {}),
      },
      include: {
        uploader: { select: { id: true, name: true } },
        // Only attendance slips cover lessons
        ...(type === SlipType.CONFESSION ? {} : {
          attendanceRecords: {
            select: { lesson: { select: { id: true, title: true, lessonNumber: true, scheduledDate: true } } },
            orderBy: { lesson: { scheduledDate: "asc" } },
          },
        }),
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(slips)
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

// POST /api/slips - Upload a slip photo for a student (multipart form)
// Fields: file, studentId, type
//   CONFESSION: periodStart (ISO date) - replaces any slip already uploaded for that period
//   ATTENDANCE: lessonIds (JSON array) - marks those lessons PRESENT for the async student
//     (only lessons that were Absent or unrecorded)
export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    if (!canManageData(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const form = await request.formData()
    const file = form.get("file") as File | null
    const studentId = String(form.get("studentId") || "")
    const type = form.get("type")

    if (!file || !studentId || !isSlipType(type)) {
      return NextResponse.json({ error: "file, studentId and a valid type are required" }, { status: 400 })
    }
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Please upload a photo (PNG, JPG, WEBP, GIF) or a PDF" }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File size exceeds 4.5 MB limit" }, { status: 400 })
    }

    const enrollment = await prisma.studentEnrollment.findUnique({
      where: { studentId },
      select: { isAsyncStudent: true },
    })
    if (!enrollment) {
      return NextResponse.json({ error: "Student is not enrolled" }, { status: 404 })
    }

    // Upload the photo, then write to the DB; a failed write deletes the orphaned blob
    const withUploadedFile = async <T>(write: (url: string) => Promise<T>) => {
      const target = blobUploadTarget(`slips/${type.toLowerCase()}/${studentId}-${Date.now()}`, file)
      const blob = await put(target.pathname, file, {
        access: "public",
        contentType: target.contentType,
        addRandomSuffix: true,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      })
      try {
        return await write(blob.url)
      } catch (error: unknown) {
        await del(blob.url, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {})
        throw error
      }
    }

    if (type === SlipType.CONFESSION) {
      const periodStart = new Date(String(form.get("periodStart") || ""))
      if (isNaN(periodStart.getTime()) || !periodStart.toISOString().endsWith("-01T00:00:00.000Z")) {
        return NextResponse.json({ error: "periodStart must be the first day of a period" }, { status: 400 })
      }
      const key = { studentId_type_periodStart: { studentId, type, periodStart } }
      const existing = await prisma.studentSlip.findUnique({ where: key, select: { imageUrl: true } })
      const slip = await withUploadedFile(imageUrl => prisma.studentSlip.upsert({
        where: key,
        update: { imageUrl, uploadedBy: user.id, createdAt: new Date() },
        create: { studentId, type, periodStart, imageUrl, uploadedBy: user.id },
      }))
      if (existing) {
        await del(existing.imageUrl, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {})
      }
      return NextResponse.json(slip, { status: 201 })
    }

    if (!enrollment.isAsyncStudent) {
      return NextResponse.json({ error: "Attendance slips are only for async students" }, { status: 400 })
    }
    let lessonIds: unknown
    try {
      lessonIds = JSON.parse(String(form.get("lessonIds") || "[]"))
    } catch {
      lessonIds = []
    }
    if (!Array.isArray(lessonIds) || lessonIds.length === 0 || !lessonIds.every(id => typeof id === "string")) {
      return NextResponse.json({ error: "Select at least one lesson this slip covers" }, { status: 400 })
    }
    const ids = [...new Set(lessonIds as string[])]

    const [lessonCount, existing] = await Promise.all([
      prisma.lesson.count({
        where: {
          id: { in: ids },
          isExamDay: false,
          status: { notIn: [LessonStatus.CANCELLED, LessonStatus.NO_CLASS] },
          scheduledDate: { lte: new Date() },
        },
      }),
      prisma.attendanceRecord.findMany({
        where: { studentId, lessonId: { in: ids } },
        select: { lessonId: true, status: true, conductRemoval: true },
      }),
    ])
    if (lessonCount !== ids.length) {
      return NextResponse.json({ error: "Slips can only cover past lessons that count toward attendance" }, { status: 400 })
    }

    // A slip only turns an absence into Present. Lessons already Present, Late or
    // Excused (including ones on another slip) and conduct removals are left alone,
    // which is what lets deleting the slip safely revert its lessons to Absent.
    const toUpdate = existing.filter(r => r.status === AttendanceStatus.ABSENT && !r.conductRemoval).map(r => r.lessonId)
    const recorded = new Set(existing.map(r => r.lessonId))
    const toCreate = ids.filter(id => !recorded.has(id))
    if (toUpdate.length + toCreate.length === 0) {
      return NextResponse.json({ error: "Those lessons are already counted for this student" }, { status: 400 })
    }

    const slip = await withUploadedFile(imageUrl => prisma.$transaction(async (tx) => {
      const created = await tx.studentSlip.create({
        data: { studentId, type, imageUrl, uploadedBy: user.id },
      })
      // Unlink any expected absence so deleting that absence can't revert the slip
      const data = { status: AttendanceStatus.PRESENT, slipId: created.id, recordedBy: user.id, notes: "Verified by attendance slip", expectedAbsenceId: null }
      await tx.attendanceRecord.updateMany({ where: { studentId, lessonId: { in: toUpdate } }, data })
      await tx.attendanceRecord.createMany({ data: toCreate.map(lessonId => ({ lessonId, studentId, ...data })) })
      return created
    }))

    return NextResponse.json(
      { ...slip, marked: toUpdate.length + toCreate.length, skipped: existing.length - toUpdate.length },
      { status: 201 }
    )
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
