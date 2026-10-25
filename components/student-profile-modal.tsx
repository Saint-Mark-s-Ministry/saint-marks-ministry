'use client'

import { useAdminGuard } from '@/hooks/useAdminGuard'
import { isAdmin } from '@/lib/roles'
import { useStudentDetails } from '@/lib/swr'
import { StudentDetailsModal } from '@/components/student-details-modal'

// Fetch the selected student for the existing SP details modal on any admin page.
export function StudentProfileModal({ studentId, onClose, onRestoreFocus }: {
  studentId: string
  onClose: () => void
  onRestoreFocus?: () => void
}) {
  const { session, status } = useAdminGuard(isAdmin)
  const allowed = status === 'authenticated' && !!session?.user.role && isAdmin(session.user.role)
  const { data, error, isLoading, mutate } = useStudentDetails(allowed ? studentId : undefined)
  const errorStatus = (error as { status?: number } | undefined)?.status
  const loadError = error ? (errorStatus === 404 ? 'Student not found' : errorStatus === 403 ? 'You do not have access to this student' : 'Unable to load student profile') : undefined

  if (!allowed) return null
  return <StudentDetailsModal
    key={studentId}
    studentId={studentId}
    studentName={data?.student.name ?? 'Student profile'}
    student={data?.student}
    examScores={data?.examScores ?? []}
    attendanceRecords={data?.attendanceRecords ?? []}
    allExams={data?.allExams}
    allLessons={data?.allLessons}
    readOnly={session.user.role === 'PRIEST'}
    showNotes={false}
    loading={isLoading || (!data && !error)}
    loadError={loadError}
    onRetry={error && errorStatus !== 403 && errorStatus !== 404 ? () => void mutate() : undefined}
    onRefresh={() => void mutate()}
    onClose={onClose}
    onRestoreFocus={onRestoreFocus}
  />
}
