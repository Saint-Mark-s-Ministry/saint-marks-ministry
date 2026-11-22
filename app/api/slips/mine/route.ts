// Servants Prep — a student's own confession slips (self-service).
//
// Students upload a photo of the slip their father of confession signed, for
// one 2-month period of the active academic year (see lib/confession.ts). The
// servant-facing upload and tracker stay on /api/slips. Students may only add a
// slip for a period that is open or has ended, and only replace a slip they
// uploaded themselves: one a servant recorded is left alone.
import { NextResponse } from "next/server"
import { put, del } from "@vercel/blob"
import { Prisma, RoleTag, SlipType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { getAuthorizationContext, assertCanWriteBusinessData } from "@/lib/authorization"
import { handleApiError } from "@/lib/api-utils"
import { blobUploadTarget } from "@/lib/blob-upload"
import { slipFileError } from "@/lib/slip-upload"
import {
  canStudentUploadConfessionSlip,
  getConfessionPeriodStatus,
  getConfessionPeriods,
  getStudentStart,
} from "@/lib/confession"

class SlipConflictError extends Error {}

// Identity and enrollment come from the database, never from the request.
async function studentAccess(write = false) {
  const user = await requireAuth()
  const context = await getAuthorizationContext(user.id)
  if (context.disabled || !context.roleTags.has(RoleTag.SERVANTS_PREP_STUDENT)) throw new Error("Forbidden")
  if (write) assertCanWriteBusinessData(context)

  const [enrollment, year] = await Promise.all([
    prisma.studentEnrollment.findUnique({
      where: { studentId: user.id },
      select: {
        isActive: true,
        status: true,
        attendanceStartDate: true,
        enrolledAt: true,
        academicYear: { select: { startDate: true } },
      },
    }),
    prisma.academicYear.findFirst({
      where: { isActive: true },
      select: { id: true, name: true, startDate: true, endDate: true },
    }),
  ])
  const active = !!enrollment?.isActive && enrollment.status === "ACTIVE"
  return { user, enrollment: active ? enrollment : null, year }
}

// GET /api/slips/mine - The active year, when the student's program started,
// and the confession slips on file for them.
export async function GET() {
  try {
    const { user, enrollment, year } = await studentAccess()
    if (!enrollment || !year) {
      return NextResponse.json({ enrolled: !!enrollment, year, studentStart: null, slips: [] }, { headers: { "Cache-Control": "private, no-store" } })
    }

    const slips = await prisma.studentSlip.findMany({
      where: { studentId: user.id, type: SlipType.CONFESSION },
      select: { id: true, periodStart: true, imageUrl: true, createdAt: true, uploadedBy: true },
      orderBy: { periodStart: "asc" },
    })

    return NextResponse.json(
      {
        enrolled: true,
        year,
        studentStart: getStudentStart(enrollment).toISOString(),
        slips: slips.map(({ uploadedBy, ...slip }) => ({ ...slip, uploadedByMe: uploadedBy === user.id })),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    )
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

// POST /api/slips/mine - Upload a confession slip (multipart: file, periodStart)
export async function POST(request: Request) {
  try {
    const { user, enrollment, year } = await studentAccess(true)
    if (!enrollment || !year) {
      return NextResponse.json({ error: "You need an active Servants Prep enrollment to upload a slip" }, { status: 403 })
    }

    const form = await request.formData()
    const file = form.get("file")
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Choose a photo or PDF of your signed slip" }, { status: 400 })
    }
    const fileError = slipFileError(file)
    if (fileError) {
      return NextResponse.json({ error: fileError }, { status: 400 })
    }

    const requested = new Date(String(form.get("periodStart") || ""))
    const period = isNaN(requested.getTime())
      ? undefined
      : getConfessionPeriods(year).find(p => p.start.getTime() === requested.getTime())
    if (!period) {
      return NextResponse.json({ error: "Choose a confession period from this academic year" }, { status: 400 })
    }
    if (!canStudentUploadConfessionSlip(getConfessionPeriodStatus(period, getStudentStart(enrollment), false))) {
      return NextResponse.json({ error: "This period doesn't need a slip" }, { status: 400 })
    }

    const key = { studentId_type_periodStart: { studentId: user.id, type: SlipType.CONFESSION, periodStart: period.start } }
    const existing = await prisma.studentSlip.findUnique({ where: key, select: { id: true, imageUrl: true, uploadedBy: true } })
    if (existing && existing.uploadedBy !== user.id) {
      return NextResponse.json({ error: "A servant already recorded your slip for this period" }, { status: 409 })
    }

    const target = blobUploadTarget(`slips/confession/${user.id}-${Date.now()}`, file)
    const blob = await put(target.pathname, file, {
      access: "public",
      contentType: target.contentType,
      addRandomSuffix: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    let slip
    try {
      if (existing) {
        // Conditional on the slip still being this student's, so a servant's
        // upload that lands in between is never overwritten.
        const updated = await prisma.studentSlip.updateMany({
          where: { id: existing.id, uploadedBy: user.id },
          data: { imageUrl: blob.url, createdAt: new Date() },
        })
        if (updated.count !== 1) throw new SlipConflictError()
        slip = await prisma.studentSlip.findUniqueOrThrow({ where: { id: existing.id } })
      } else {
        slip = await prisma.studentSlip.create({
          data: { studentId: user.id, type: SlipType.CONFESSION, periodStart: period.start, imageUrl: blob.url, uploadedBy: user.id },
        })
      }
    } catch (error: unknown) {
      await del(blob.url, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {})
      const raced = error instanceof SlipConflictError ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      if (raced) {
        return NextResponse.json({ error: "Your slip for this period changed. Refresh and try again" }, { status: 409 })
      }
      throw error
    }

    if (existing) {
      await del(existing.imageUrl, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {})
    }

    return NextResponse.json(
      { id: slip.id, periodStart: slip.periodStart, imageUrl: slip.imageUrl, createdAt: slip.createdAt, uploadedByMe: true },
      { status: 201 }
    )
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
