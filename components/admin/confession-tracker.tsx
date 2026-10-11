'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { KpiStrip } from '@/components/ds/kpi-strip'
import { Panel } from '@/components/ds/panel'
import { Segmented } from '@/components/ds/segmented'
import { SearchField } from '@/components/ds/search-field'
import { StatusBadge, type Tone } from '@/components/ds/status-badge'
import { FilterSelect } from '@/components/ui/filter-select'
import { TableSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { formatToastTimestamp } from '@/lib/utils'
import { fetcher, defaultSWRConfig, staticDataConfig } from '@/lib/swr'
import type { AcademicYear } from '@/lib/types'
import {
  formatConfessionPeriod,
  getConfessionPeriods,
  getConfessionPeriodStatus,
  getStudentStart,
  type ConfessionPeriod,
  type ConfessionPeriodStatus,
} from '@/lib/confession'
import { uploadSlip, deleteSlip, useSlips } from '@/lib/slips-client'

export interface ConfessionEnrollment {
  studentId: string
  academicYearId: string | null
  attendanceStartDate: string | null
  enrolledAt: string
  student: { id: string; name: string }
  fatherOfConfession?: { name: string } | null
}

interface ConfessionSlip {
  id: string
  studentId: string
  periodStart: string
  imageUrl: string
  createdAt: string
  uploader: { name: string } | null
}

const STATUS_BADGE: Record<ConfessionPeriodStatus, { label: string; tone: Tone | null }> = {
  slip: { label: 'Received', tone: 'ok' },
  registration: { label: 'Registration', tone: 'info' },
  missing: { label: 'Missed', tone: 'bad' },
  due: { label: 'Due', tone: 'warn' },
  upcoming: { label: 'Future', tone: 'neutral' },
  na: { label: 'Not enrolled', tone: null },
}

type View = 'all' | 'due' | 'received' | 'missed'

/**
 * Grid of students × 2-month confession periods for an academic year.
 * Pass `enrollment` to show just that student (student details modal);
 * otherwise all active students are loaded.
 */
export function ConfessionTracker({ enrollment, canEdit }: { enrollment?: ConfessionEnrollment; canEdit: boolean }) {
  const { data: years = [] } = useSWR<AcademicYear[]>('/api/academic-years', fetcher, staticDataConfig)
  const { data: fetched, error } = useSWR<ConfessionEnrollment[]>(
    enrollment ? null : '/api/enrollments?status=ACTIVE',
    fetcher,
    defaultSWRConfig
  )
  const { data: slips = [], mutate: mutateSlips } = useSlips<ConfessionSlip>('CONFESSION', enrollment?.studentId)
  const enrollments = useMemo(() => (enrollment ? [enrollment] : fetched), [enrollment, fetched])

  const [pickedYearId, setYearId] = useState('')
  const [busyCell, setBusyCell] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<View>('all')
  const [father, setFather] = useState('all')

  // Years come newest first; default to the active one
  const yearId = pickedYearId || (years.find(y => y.isActive) ?? years[0])?.id || ''

  const rows = useMemo(() => {
    const year = years.find(y => y.id === yearId)
    const periods = year ? getConfessionPeriods(year) : []
    const slipByKey = new Map(slips.map(s => [`${s.studentId}|${new Date(s.periodStart).toISOString()}`, s]))
    return [...(enrollments ?? [])].sort((a, b) => a.student.name.localeCompare(b.student.name)).map(e => {
      const start = getStudentStart({ ...e, academicYear: years.find(y => y.id === e.academicYearId) })
      const cells = periods.map(period => {
        const key = `${e.studentId}|${period.start.toISOString()}`
        const slip = slipByKey.get(key)
        return { key, period, slip, status: getConfessionPeriodStatus(period, start, !!slip) }
      })
      return { enrollment: e, cells, missing: cells.filter(c => c.status === 'missing').length }
    })
  }, [enrollments, slips, years, yearId])

  const now = new Date()
  const currentIndex = rows[0]?.cells.findIndex(({ period }) => period.start <= now && now < period.end) ?? -1
  const current = currentIndex >= 0 ? rows[0]?.cells[currentIndex].period : undefined
  const currentStatus = (r: (typeof rows)[number]) => (currentIndex >= 0 ? r.cells[currentIndex].status : undefined)
  const counts = {
    received: rows.filter((r) => currentStatus(r) === 'slip' || currentStatus(r) === 'registration').length,
    due: rows.filter((r) => currentStatus(r) === 'due').length,
    missed: rows.filter((r) => r.missing > 0).length,
  }
  const fathers = [...new Set(rows.map((r) => r.enrollment.fatherOfConfession?.name).filter((n): n is string => !!n))].sort()

  const visibleRows = rows.filter(r =>
    (view === 'all' ||
      (view === 'due' && currentStatus(r) === 'due') ||
      (view === 'received' && (currentStatus(r) === 'slip' || currentStatus(r) === 'registration')) ||
      (view === 'missed' && r.missing > 0)) &&
    (father === 'all' || (r.enrollment.fatherOfConfession?.name ?? '') === father) &&
    (!search || r.enrollment.student.name.toLowerCase().includes(search.toLowerCase()))
  )
  const daysLeft = current ? Math.ceil((current.end.getTime() - now.getTime()) / 86_400_000) : 0

  const handleUpload = async (key: string, studentId: string, period: ConfessionPeriod, file: File | undefined) => {
    if (!file) return
    setBusyCell(key)
    try {
      await uploadSlip(file, { studentId, type: 'CONFESSION', periodStart: period.start.toISOString() })
      toast.success('Confession slip uploaded', { description: formatConfessionPeriod(period) })
      await mutateSlips()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setBusyCell(null)
    }
  }

  const handleRemove = async (slip: ConfessionSlip) => {
    if (!confirm('Remove this confession slip?')) return
    try {
      await deleteSlip(slip.id)
      toast.success('Confession slip removed')
      await mutateSlips()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove slip')
    }
  }

  if (error) return <EmptyState message="Failed to load the confession tracker" />
  if (!enrollments) return <TableSkeleton />

  const table = visibleRows.length === 0 ? (
    <EmptyState message={rows.length === 0 ? 'No active students this year.' : 'No students match these filters.'} />
  ) : (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-[13px] text-ink">
        <thead className="bg-raised">
          <tr className="border-b border-line text-left text-xs text-ink-3">
            {!enrollment && (
              <th scope="col" className="sticky left-0 z-10 h-9 min-w-48 border-r border-line bg-raised px-3 font-medium">Student</th>
            )}
            {visibleRows[0].cells.map(({ period }, i) => (
              <th key={period.start.toISOString()} scope="col" className="px-3 font-medium whitespace-nowrap">
                {formatConfessionPeriod(period)}
                {i === currentIndex && <span className="ml-1 font-semibold text-accent-ink">· now</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map(({ enrollment: e, cells, missing }) => (
            <tr key={e.studentId} className="border-b border-line last:border-0">
              {!enrollment && (
                <th scope="row" className="sticky left-0 z-10 max-w-56 border-r border-line bg-surface px-3 py-2 text-left font-normal">
                  <div className="truncate font-medium">{e.student.name}</div>
                  <div className="truncate text-xs text-ink-3">{e.fatherOfConfession?.name ?? 'No father of confession'}</div>
                  {missing > 0 && <div className="text-xs text-bad">{missing} missed</div>}
                </th>
              )}
              {cells.map(({ key, period, slip, status }, i) => {
                const meta = STATUS_BADGE[status]
                const badge = meta.tone ? <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge> : <span className="text-ink-3">—</span>
                return (
                  <td key={key} className={`px-3 py-2 align-middle ${i === currentIndex ? 'bg-accent-tint/50' : ''}`}>
                    <div className="flex items-center gap-1.5">
                      {slip ? (
                        <a
                          href={slip.imageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="no-underline hover:opacity-80"
                          title={`View slip · uploaded ${formatToastTimestamp(new Date(slip.createdAt))}${slip.uploader ? ` by ${slip.uploader.name}` : ''}`}
                        >
                          {badge}
                        </a>
                      ) : (
                        badge
                      )}
                      {canEdit && status !== 'na' && status !== 'upcoming' && (
                        <>
                          <label className="inline-flex h-7 cursor-pointer items-center rounded-md px-1.5 text-xs font-medium text-accent-ink hover:bg-hover focus-within:outline-2 focus-within:outline-accent-ink">
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              className="sr-only"
                              disabled={busyCell === key}
                              aria-label={`${slip ? 'Replace' : 'Upload'} ${formatConfessionPeriod(period)} slip for ${e.student.name}`}
                              onChange={(ev) => {
                                const file = ev.target.files?.[0]
                                ev.target.value = ''
                                handleUpload(key, e.studentId, period, file)
                              }}
                            />
                            {busyCell === key ? 'Uploading…' : slip ? 'Replace' : 'Upload'}
                          </label>
                          {slip && (
                            <button
                              type="button"
                              onClick={() => handleRemove(slip)}
                              aria-label={`Remove ${formatConfessionPeriod(period)} slip`}
                              className="cursor-pointer rounded-md p-1.5 text-ink-3 hover:text-bad"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  // Embedded in the student editor: just the row, with a year picker.
  if (enrollment) {
    return (
      <div className="w-full min-w-0 space-y-3">
        <FilterSelect aria-label="Academic year" value={yearId} onChange={setYearId} options={years.map((y) => ({ value: y.id, label: y.name }))} />
        <div className="overflow-hidden rounded-lg border border-line">{table}</div>
      </div>
    )
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <KpiStrip
        items={[
          {
            label: 'Current period',
            value: <span className="text-[22px]">{current ? formatConfessionPeriod(current) : '—'}</span>,
            hint: current ? `Closes ${new Date(current.end.getTime() - 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} · ${daysLeft} days left` : 'Outside the academic year',
          },
          { label: 'Slips received', value: counts.received, hint: `of ${rows.length} students` },
          { label: 'Still due', value: counts.due, hint: 'this period', tone: counts.due > 0 ? 'warn' : undefined },
          { label: 'Missed a past period', value: counts.missed, hint: counts.missed === 0 ? 'none yet this year' : 'students', tone: counts.missed > 0 ? 'bad' : undefined },
        ]}
      />

      <Panel
        toolbar={
          <>
            <Segmented
              label="Confession status"
              value={view}
              onChange={setView}
              options={[
                { value: 'all', label: 'All', count: rows.length },
                { value: 'due', label: 'Due', count: counts.due },
                { value: 'received', label: 'Received', count: counts.received },
                { value: 'missed', label: 'Missed', count: counts.missed },
              ]}
            />
            <div className="flex w-full flex-wrap items-center gap-2 lg:ml-auto lg:w-auto">
              <FilterSelect
                aria-label="Academic year"
                value={yearId}
                onChange={setYearId}
                options={years.map((y) => ({ value: y.id, label: y.name.replace('-', '–') }))}
              />
              <FilterSelect
                aria-label="Father of confession"
                value={father}
                onChange={setFather}
                options={[{ value: 'all', label: 'All fathers' }, ...fathers.map((f) => ({ value: f, label: f }))]}
                className="max-w-56"
              />
              <SearchField value={search} onChange={setSearch} placeholder="Search students" className="flex-1 md:flex-none" />
            </div>
          </>
        }
      >
        <div className="flex flex-col gap-2 border-b border-line px-4 py-2.5 text-xs text-ink-3">
          <p>
            Every student confesses at least once per two-month period. The registration form covers the first period;
            after that, upload a photo of the slip signed by the father of confession.
          </p>
          <div className="flex flex-wrap gap-2">
            {(['slip', 'due', 'missing', 'registration', 'upcoming'] as const).map((k) => (
              <StatusBadge key={k} tone={STATUS_BADGE[k].tone as Tone}>{STATUS_BADGE[k].label}</StatusBadge>
            ))}
          </div>
        </div>
        {table}
      </Panel>
    </div>
  )
}
