import type { AttendanceStatus, SundaySchoolPhoneCallOutcome, SundaySchoolVisitationStatus } from '@prisma/client'
import type { AttendanceCounts } from '@/lib/attendance-utils'

export type StudentHistoryProgram = 'prep' | 'sunday-school'
export interface StudentHistoryTarget {
  id: string
  name: string
  program: StudentHistoryProgram
}

/** Deliberate read-only projection; no account credentials or guardian contacts. */
export interface StudentHistory {
  id: string
  name: string
  program: StudentHistoryProgram
  subtitle: string
  canReadPrivateNotes?: boolean
  attendance: {
    kind: 'lessons' | 'rotations' | 'meetings'
    counts: AttendanceCounts
    rate: number | null
    records: Array<{
      id: string
      date: string
      title: string
      status: AttendanceStatus
      notes: string | null
      notApplicable: boolean
      excluded: boolean
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
  }> | null
  phoneCalls: Array<{
    id: string
    calledAt: string
    outcome: SundaySchoolPhoneCallOutcome
    note: string
    callerName: string
  }>
}
