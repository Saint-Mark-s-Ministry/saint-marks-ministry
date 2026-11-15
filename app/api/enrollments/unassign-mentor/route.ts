import { Prisma } from "@prisma/client"
import { syncMentorCompatibilityRoles } from "@/lib/mentor-assignments"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { canSelfAssignMentees } from "@/lib/roles"

// POST /api/enrollments/unassign-mentor - Servant removes themselves as mentor from a student
export async function POST(request: Request) {
  try {
    const user = await requireAuth()

    // Check if user has permission to self-assign/unassign mentees
    if (!canSelfAssignMentees(user.role)) {
      return NextResponse.json(
        { error: "You do not have permission to unassign mentees" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { studentId } = body

    if (!studentId) {
      return NextResponse.json(
        { error: "Student ID is required" },
        { status: 400 }
      )
    }

    return await prisma.$transaction(async (tx) => {
      // Check if enrollment exists and this servant is the mentor
      const enrollment = await tx.studentEnrollment.findUnique({
        where: { studentId }
      })

      if (!enrollment) {
        return NextResponse.json(
          { error: "Enrollment not found" },
          { status: 404 }
        )
      }

      if (enrollment.mentorId !== user.id) {
        return NextResponse.json(
          { error: "You are not the mentor for this student" },
          { status: 403 }
        )
      }

      // Remove mentor assignment (set mentorId to null)
      const updatedEnrollment = await tx.studentEnrollment.update({
        where: { studentId },
        data: { mentorId: null, mentorName: null, mentorPhone: null },
        include: {
          student: true
        }
      })

      await tx.mentorAssignment.updateMany({
        where: { studentEnrollmentId: enrollment.id, endedAt: null },
        data: { endedAt: new Date(), endedById: user.id, endReason: 'Mentor removed themselves' },
      })
      await syncMentorCompatibilityRoles(tx, [user.id])
      return NextResponse.json(updatedEnrollment)
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return NextResponse.json({ error: 'Mentee assignments changed. Refresh and try again.' }, { status: 409 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to unassign mentee" },
      { status: 500 }
    )
  }
}
