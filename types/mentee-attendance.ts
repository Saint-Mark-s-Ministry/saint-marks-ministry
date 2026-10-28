import type { AttendanceStatus } from '@prisma/client'

export interface MenteeAttendanceHistory {
  isAsyncStudent: boolean
  records: Array<{
    id: string
    status: AttendanceStatus
    notEnrolledYet: boolean
    expectedAbsenceNA: boolean
    lesson: { title: string; scheduledDate: string }
  }>
}
