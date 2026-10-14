'use client'

import { useEffect, useState } from 'react'
import { Panel } from '@/components/ds/panel'
import { SearchField } from '@/components/ds/search-field'
import { Button } from '@/components/ui/button'
import { FilterSelect } from '@/components/ui/filter-select'
import { organizeAttendanceRoster, type AttendanceRosterNameOrder } from '@/lib/attendance-roster'
import { useSundaySchoolIndividualAttendance } from '@/lib/swr'
import { formatDateUTC } from '@/lib/utils'
import type { IndividualAttendanceHistory } from '@/lib/sunday-school-individual-attendance'
import type { AttendanceStatus } from '@prisma/client'

const MARKS: Record<AttendanceStatus, { label: string; short: string; tone: string }> = {
  PRESENT: { label: 'Present', short: 'P', tone: 'text-ok bg-ok-tint' },
  LATE: { label: 'Late', short: 'L', tone: 'text-warn bg-warn-tint' },
  ABSENT: { label: 'Absent', short: 'A', tone: 'text-danger bg-danger-tint' },
  EXCUSED: { label: 'Excused', short: 'E', tone: 'text-ink-3 bg-surface' },
}

export function SundaySchoolIndividualAttendance({ classId, savedAt }: { classId: string; savedAt?: string | Date | null }) {
  const { data, error, isLoading, mutate } = useSundaySchoolIndividualAttendance(classId)
  const history = data as IndividualAttendanceHistory | undefined
  const [search, setSearch] = useState('')
  const [nameOrder, setNameOrder] = useState<AttendanceRosterNameOrder>('last')
  useEffect(() => { if (savedAt) void mutate() }, [mutate, savedAt])
  const filtered = history?.children.filter(child => `${child.firstName} ${child.lastName}`.toLowerCase().includes(search.trim().toLowerCase())) ?? []
  const children = organizeAttendanceRoster(filtered, { nameOrder, groupByGender: false })[0].entries
  return (
    <Panel toolbar={
      <>
        <h2 className="font-medium">Individual weekly attendance</h2>
        <FilterSelect
          aria-label="Alphabetize individual history by"
          value={nameOrder}
          onChange={value => setNameOrder(value as AttendanceRosterNameOrder)}
          options={[
            { value: 'last', label: 'Sort by last name' },
            { value: 'first', label: 'Sort by first name' },
          ]}
        />
        <SearchField value={search} onChange={setSearch} placeholder="Find a child" />
      </>
    }>
      <p className="px-4 py-3 text-sm text-ink-3">P = Present · L = Late · A = Absent · E = Excused · — = Unrecorded. Rate uses saved marks only; late counts half and excused is excluded.</p>
      {error ? <p role="alert" className="p-4">Couldn’t load attendance history. <Button variant="outline" onClick={() => void mutate()}>Retry</Button></p>
        : isLoading ? <p role="status" className="p-4">Loading attendance history…</p>
        : !history?.dates.length ? <p className="p-4 text-ink-3">No past meetings are available for this class yet.</p>
        : children.length === 0 ? <p className="p-4 text-ink-3">No children match.</p>
        : <div className="overflow-x-auto" role="region" aria-label="Individual weekly attendance table" tabIndex={0}>
          <table className="w-full whitespace-nowrap text-sm">
            <caption className="sr-only">Each child’s saved attendance by meeting date, totals, and attendance rate</caption>
            <thead><tr className="border-y border-line">
              <th scope="col" className="sticky left-0 z-10 bg-surface p-3 text-left">Child</th>
              <th scope="col" className="p-3">Rate</th>
              {['Present', 'Late', 'Absent'].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}
              {history.dates.map(date => <th key={date} scope="col" className="p-3">{formatDateUTC(date, { month: 'short', day: 'numeric', year: 'numeric' })}</th>)}
            </tr></thead>
            <tbody>{children.map(child => <tr key={child.id} className="border-b border-line">
              <th scope="row" className="sticky left-0 bg-surface p-3 text-left font-medium">{child.firstName} {child.lastName}{!child.onRoster && <span className="block text-xs font-normal text-ink-3">Former roster member</span>}</th>
              <td className="p-3 text-center">{child.rate === null ? '—' : `${Math.round(child.rate)}%`}</td>
              {[child.counts.present, child.counts.late, child.counts.absent].map((count, index) => <td key={index} className="p-3 text-center">{count}</td>)}
              {history.dates.map(date => {
                const mark = child.attendance[date] ? MARKS[child.attendance[date]] : null
                return <td key={date} className="p-3 text-center"><span aria-label={mark?.label ?? 'Unrecorded'} title={mark?.label ?? 'Unrecorded'} className={`inline-block min-w-7 rounded px-2 py-1 ${mark?.tone ?? 'text-ink-3'}`}>{mark?.short ?? '—'}</span></td>
              })}
            </tr>)}</tbody>
          </table>
        </div>}
    </Panel>
  )
}
