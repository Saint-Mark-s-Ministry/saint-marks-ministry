import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { canSelfAssignMentees } from "@/lib/roles"

// POST /api/enrollments/self-assign - Servant assigns student as mentee to themselves
export async function POST(request: Request) {
  try {
    const user = await requireAuth()

    // Check if user has permission to self-assign mentees
    if (!canSelfAssignMentees(user.role)) {
      return NextResponse.json(
        { error: "You do not have permission to self-assign mentees" },
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

    // Check current mentee count for this servant
    const currentMentees = await prisma.studentEnrollment.count({
      where: {
        mentorId: user.id
      }
    })

    if (currentMentees >= 3) {
      return NextResponse.json(
        { error: "You have reached the maximum of 3 mentees" },
        { status: 400 }
      )
    }

    // Check if student exists and is a STUDENT role
    const student = await prisma.user.findUnique({
      where: { id: studentId }
    })

    if (!student || student.role !== 'STUDENT') {
      return NextResponse.json(
        { error: "Invalid student" },
        { status: 404 }
      )
    }

    // Check if student already has an enrollment
    const existingEnrollment = await prisma.studentEnrollment.findUnique({
      where: { studentId }
    })

    if (existingEnrollment) {
      if (existingEnrollment.isActive && existingEnrollment.yearLevel === 'YEAR_2') {
        const submittedForm = await prisma.annualMentorInformation.findFirst({
          where: { studentId, academicYear: { isActive: true } }, select: { id: true },
        })
        if (!submittedForm) return NextResponse.json({ error: 'Submit the current Year 2 mentor form before assigning a mentor' }, { status: 409 })
      }
      // Refuse to silently steal a student who already has a different mentor.
      // Re-assignments must go through an admin so the prior mentor doesn't
      // lose their mentee without anyone noticing.
      if (existingEnrollment.mentorId && existingEnrollment.mentorId !== user.id) {
        return NextResponse.json(
          { error: "This student already has a mentor. Ask an administrator to reassign them." },
          { status: 409 }
        )
      }

      // Update existing enrollment to assign this servant as mentor
      const enrollment = await prisma.studentEnrollment.update({
        where: { studentId },
        data: { mentorId: user.id },
        include: {
          student: true
        }
      })

      return NextResponse.json(enrollment)
    } else {
      // Create new enrollment with this servant as mentor
      const enrollment = await prisma.studentEnrollment.create({
        data: {
          studentId,
          mentorId: user.id,
          yearLevel: 'YEAR_1', // Default to Year 1 for new enrollments
          isActive: true
        },
        include: {
          student: true
        }
      })

      return NextResponse.json(enrollment)
    }
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to assign mentee" },
      { status: 500 }
    )
  }
}
