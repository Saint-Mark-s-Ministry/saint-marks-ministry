import type { SundaySchoolPhoneCallOutcome } from '@prisma/client'

export interface SundaySchoolCheckIns {
  viewerId: string
  weekOf: string
  classes: Array<{
    id: string
    name: string
    canAssign: boolean
    servants: Array<{ assignmentId: string; userId: string; name: string }>
    children: Array<{
      id: string
      firstName: string
      lastName: string
      assignmentId: string | null
      assignee: { id: string; name: string } | null
      callThisWeek: { calledAt: string; outcome: SundaySchoolPhoneCallOutcome } | null
    }>
  }>
}
