'use client'

import { StudentName } from '@/components/student-history-provider'

import { usePrepRotationAssignments } from '@/lib/swr'
import { completedRotationLevels, ROTATION_LEVELS } from '@/lib/rotation-forms'
import { Panel } from '@/components/ds/panel'
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'

export function RotationProgressOverview() {
  const { data: assignments, error, isLoading } = usePrepRotationAssignments()
  if (isLoading) return <PageLoading />
  if (error) return <EmptyState message="Could not load rotation progress." />
  const studentIds = [...new Set((assignments ?? []).map(assignment => assignment.studentId))]
  return <Panel title="Rotation progress" description="Ten grades, four signed and approved weeks per grade.">
    {studentIds.length === 0 ? <EmptyState message="No rotations assigned yet." /> : <ul className="divide-y divide-line">
      {studentIds.map(studentId => {
        const history = (assignments ?? []).filter(assignment => assignment.studentId === studentId)
        const current = history.find(assignment => assignment.isActive)
        const completed = completedRotationLevels(history).size
        return <li key={studentId} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
          <span className="font-medium"><StudentName id={studentId} name={history[0].student.name} /></span>
          <span>{current?.class?.name ?? (completed === ROTATION_LEVELS.length ? 'All rotations complete' : 'No active rotation')}</span>
          <span>{completed} of {ROTATION_LEVELS.length} grades approved</span>
        </li>
      })}
    </ul>}
  </Panel>
}
