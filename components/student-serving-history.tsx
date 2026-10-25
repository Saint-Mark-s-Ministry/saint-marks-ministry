'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useStudentServingProgress } from '@/lib/swr'
import { formatDateUTC } from '@/lib/utils'
import type { SundaySchoolLogStatus, YearLevel } from '@prisma/client'

export interface StudentServingProgress {
  completedRotations?: number
  requiredRotations?: number
  assignments: Array<{
    assignmentId: string
    gradeDisplayName: string
    yearLevel: YearLevel | null
    academicYear: { id: string; name: string }
    totalWeeks: number
    isActive: boolean
    rotationForm?: { status: string; fileUrl: string; filename: string; reviewNotes: string | null } | null
    attendance: { effectiveTotal: number; present: number; excused: number; percentage: number; met: boolean } | null
    weekBreakdown: Array<{
      weekNumber: number
      weekOf: string
      status: SundaySchoolLogStatus | null
      notes: string | null
      studentNotes: string | null
    }>
  }>
}

const statusLabels: Record<SundaySchoolLogStatus, string> = {
  VERIFIED: 'Verified', MANUAL: 'Recorded by staff', EXCUSED: 'Excused', REJECTED: 'Rejected',
}

// Prep students' serving requirement, separate from Sunday School ministry records.
export function StudentServingHistory({ studentId }: { studentId: string }) {
  const { data, error, isLoading, mutate } = useStudentServingProgress(studentId)
  if (error) return <div role="alert" className="rounded-lg border p-4">Unable to load serving history. <Button variant="outline" onClick={() => void mutate()}>Retry</Button></div>
  if (isLoading || !data) return <p role="status" className="p-4 text-muted-foreground">Loading serving history...</p>
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">SP serving requirement</h2>
        <p className="text-sm text-muted-foreground">Sunday School serving rotations and weekly verification for the prep program.</p>
        {data.requiredRotations !== undefined && <p className="text-sm">{data.completedRotations ?? 0} of {data.requiredRotations} grade rotations approved</p>}
      </div>
      {data.assignments.length === 0 && <p className="rounded-lg border p-6 text-muted-foreground">No serving assignments recorded.</p>}
      {data.assignments.map(assignment => (
        <Card key={assignment.assignmentId}>
          <CardHeader>
            <CardTitle className="text-base">{assignment.gradeDisplayName} · {assignment.academicYear.name}</CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {assignment.yearLevel && <Badge variant="outline">{assignment.yearLevel === 'YEAR_1' ? 'Year 1' : 'Year 2'}</Badge>}
              <Badge variant="outline">{assignment.isActive ? 'Active' : 'Inactive'}</Badge>
              {assignment.attendance && <span>{assignment.attendance.present} of {assignment.totalWeeks} weeks served · {assignment.attendance.percentage.toFixed(1)}% · {assignment.attendance.met ? 'Requirement met' : 'Requirement not met'}</span>}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {assignment.rotationForm && <div className="rounded-md border p-3 text-sm">
              <p>Rotation form: {assignment.rotationForm.status.toLowerCase()}</p>
              <a href={assignment.rotationForm.fileUrl} target="_blank" rel="noopener noreferrer" className="underline">View signed rotation form</a>
              {assignment.rotationForm.reviewNotes && <p>{assignment.rotationForm.reviewNotes}</p>}
            </div>}
            {assignment.weekBreakdown.map(week => (
              <div key={week.weekNumber} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span>Week {week.weekNumber} · {formatDateUTC(week.weekOf)}</span>
                  <Badge variant="outline">{week.status ? statusLabels[week.status] : 'Not recorded'}</Badge>
                </div>
                {week.notes && <p className="mt-2 whitespace-pre-wrap">Staff: {week.notes}</p>}
                {week.studentNotes && <p className="mt-2 whitespace-pre-wrap text-muted-foreground">Student: {week.studentNotes}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
