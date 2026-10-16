import type { AttendanceStatus, SundaySchoolChildGender, SundaySchoolLevel, SundaySchoolPhoneCallOutcome, SundaySchoolVisitationStatus } from '@prisma/client'
import type { AttendanceCounts } from '@/lib/attendance-utils'
import type { SundaySchoolFamilyDetails } from '@/lib/sunday-school-family'

export type StudentHistoryProgram = 'sunday-school'
export interface StudentHistoryTarget {
  id: string
  name: string
  program: StudentHistoryProgram
}

/** Read-only child details, available only after the Sunday School class check. */
export interface StudentHistory {
  id: string
  name: string
  program: StudentHistoryProgram
  subtitle: string
  /** Display-only enrollment status for linked Sunday School accounts. */
  isServantsPrepStudent?: boolean
  /** Display photo resolved from the child's photo, then their linked account. */
  photoUrl?: string | null
  canReadPrivateNotes?: boolean
  profile: {
    className: string | null
    level: SundaySchoolLevel
    birthDate: string | null
    gender: SundaySchoolChildGender | null
    isActive: boolean
    fatherOfConfession: string | null
    phone: string | null
    email: string | null
    guardian: { name: string | null; phone: string | null; email: string | null }
    family: SundaySchoolFamilyDetails | null
  }
  attendance: {
    kind: 'meetings'
    counts: AttendanceCounts
    rate: number | null
    records: Array<{
      id: string
      date: string
      title: string
      status: AttendanceStatus
      notes: string | null
    }>
  }
  notes: {
    general: string | null
    entries: Array<{ id: string; content: string; createdAt: string; author: { name: string } }>
  }
  visitations: Array<{
    id: string
    status: SundaySchoolVisitationStatus
    visitedAt: string | null
    createdAt: string
    notes: string | null
    recorder: { name: string } | null
  }>
  phoneCalls: Array<{
    id: string
    calledAt: string
    outcome: SundaySchoolPhoneCallOutcome
    note: string
    callerName: string
  }>
}
