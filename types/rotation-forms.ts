export interface RotationFormSummary {
  id: string
  level: import('@prisma/client').SundaySchoolLevel
  fileUrl: string
  filename: string
  version: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  reviewNotes: string | null
  createdAt: string
}

export interface PrepRotationAssignment {
  id: string
  studentId: string
  student: { id: string; name: string; email: string }
  grade: string
  class: { id: string; name: string; level: import('@prisma/client').SundaySchoolLevel } | null
  rotationForm: { status: string; level: import('@prisma/client').SundaySchoolLevel } | null
  isActive: boolean
  totalWeeks: number
  presentCount: number
}

export interface RotationFormReview extends RotationFormSummary {
  assignment: {
    id: string
    studentId: string
    student: { id: string; name: string }
    class: { id: string; name: string; level: import('@prisma/client').SundaySchoolLevel } | null
    grade: string
    startDate: string
    isActive: boolean
  }
}
