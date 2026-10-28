'use client'

import { Button } from '@/components/ui/button'
import { ATTENDANCE_TONE, StatusBadge } from '@/components/ds/status-badge'
import { getAttendanceStatusLabel } from '@/lib/attendance-utils'
import { useMenteeAttendanceHistory } from '@/lib/swr'
import { formatDateUTC } from '@/lib/utils'

export function MenteeAttendanceHistory({ studentId, studentName, viewerId }: {
  studentId: string
  studentName: string
  viewerId?: string
}) {
  const { data, error, isLoading, isValidating, mutate } = useMenteeAttendanceHistory(studentId, viewerId)
  const status = (error as { status?: number } | undefined)?.status

  return (
    <section aria-label={`Attendance history for ${studentName}`} className="min-w-0 lg:col-span-2">
      <h3 className="mb-3 text-sm font-semibold text-ink">Attendance history</h3>
      {error ? (
        <div className="space-y-2 text-sm text-ink-3">
          <p>{status === 403 ? 'You no longer have access to this student’s attendance.'
            : status === 404 ? 'This student’s enrollment is no longer available.'
              : 'Unable to load attendance history.'}</p>
          {status !== 403 && status !== 404 && <Button variant="outline" size="sm" onClick={() => void mutate()}>Try again</Button>}
        </div>
      ) : isLoading || isValidating || !data ? (
        <p role="status" className="text-sm text-ink-3">Loading attendance history…</p>
      ) : data.isAsyncStudent ? (
        <p className="text-sm text-ink-3">This student’s attendance is based on serving rotations. Lesson attendance does not apply.</p>
      ) : data.records.length === 0 ? (
        <p className="text-sm text-ink-3">No lesson attendance has been recorded for this student yet.</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-ink-3">Recorded lessons, newest first. Exam days and cancelled classes are excluded.</p>
          <ul className="max-h-96 overflow-y-auto divide-y divide-line rounded-md border border-line">
            {data.records.map(record => (
              <li key={record.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-3 text-sm">
                <div className="min-w-0 flex-1 basis-40">
                  <p className="font-medium text-ink">{formatDateUTC(record.lesson.scheduledDate)}</p>
                  <p className="break-words text-ink-2">{record.lesson.title}</p>
                  {record.notEnrolledYet && <p className="text-xs text-ink-3">Before the student joined</p>}
                  {record.expectedAbsenceNA && !record.notEnrolledYet && <p className="text-xs text-ink-3">Expected absence · not counted</p>}
                </div>
                <StatusBadge tone={record.notEnrolledYet || record.expectedAbsenceNA ? 'neutral' : ATTENDANCE_TONE[record.status]}>
                  {record.notEnrolledYet || record.expectedAbsenceNA ? 'N/A' : getAttendanceStatusLabel(record.status)}
                </StatusBadge>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
