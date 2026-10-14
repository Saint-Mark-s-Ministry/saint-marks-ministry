'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useSundaySchoolIndividualAttendance } from '@/lib/swr'
import { formatDateUTC } from '@/lib/utils'
import { getAttendanceStatusLabel } from '@/lib/attendance-utils'
import type { IndividualAttendanceHistory } from '@/lib/sunday-school-individual-attendance'

export function SundaySchoolChildAttendanceHistory({ classId, childId, savedAt }: { classId: string; childId: string; savedAt?: Date | null }) {
  const { data, error, isLoading, mutate } = useSundaySchoolIndividualAttendance(classId)
  useEffect(() => { if (savedAt) void mutate() }, [mutate, savedAt])
  const history = data as IndividualAttendanceHistory | undefined
  const child = history?.children.find(row => row.id === childId)

  if (isLoading) return <p role="status" className="py-4 text-sm text-ink-3">Loading attendance history…</p>
  if (error) return <div role="alert" className="space-y-3 py-4"><p>Couldn’t load attendance history.</p><Button variant="outline" onClick={() => void mutate()}>Retry</Button></div>
  if (!child) return <p className="py-4 text-sm text-ink-3">This child is no longer available in this class’s history. Refresh the roster and try again.</p>

  const stats = [
    { label: 'Rate', value: child.rate === null ? '—' : `${Math.round(child.rate)}%` },
    { label: 'Present', value: child.counts.present },
    { label: 'Late', value: child.counts.late },
    { label: 'Absent', value: child.counts.absent },
    { label: 'Excused', value: child.counts.excused },
  ]

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 rounded-lg border border-line p-4 sm:grid-cols-5">
        {stats.map(stat => <div key={stat.label}><dt className="text-xs text-ink-3">{stat.label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{stat.value}</dd></div>)}
      </dl>
      <p className="text-sm text-ink-3">Only saved marks count toward the rate. Late counts half; excused and unrecorded weeks are excluded.</p>
      {!history?.dates.length ? <p className="py-4 text-sm text-ink-3">No past meetings are available for this class yet.</p> : (
        <table className="w-full text-sm">
          <caption className="sr-only">Saved weekly attendance for {child.firstName} {child.lastName}</caption>
          <thead><tr className="border-b border-line"><th scope="col" className="py-2 text-left font-medium">Meeting date</th><th scope="col" className="py-2 text-right font-medium">Attendance</th></tr></thead>
          <tbody>{[...history.dates].reverse().map(date => {
            const mark = child.attendance[date]
            return <tr key={date} className="border-b border-line last:border-0"><th scope="row" className="py-3 text-left font-normal">{formatDateUTC(date, { month: 'short', day: 'numeric', year: 'numeric' })}</th><td className="py-3 text-right">{mark ? getAttendanceStatusLabel(mark) : <span className="text-ink-3">Unrecorded</span>}</td></tr>
          })}</tbody>
        </table>
      )}
    </div>
  )
}
