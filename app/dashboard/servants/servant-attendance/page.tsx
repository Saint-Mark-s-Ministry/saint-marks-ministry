'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SundaySchoolServantAttendanceStatus } from '@prisma/client'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { Segmented } from '@/components/ds/segmented'
import { StatusBadge } from '@/components/ds/status-badge'
import { Initials } from '@/components/ds/person'
import { FilterSelect } from '@/components/ui/filter-select'
import { LastSaved } from '@/components/ui/last-saved'
import { SundaySchoolRecentAttendanceChart } from '@/components/sunday-school-recent-attendance-chart'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PageLoading } from '@/components/ui/page-loading'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'
import {
  useSundaySchoolClasses,
  useSundaySchoolDashboard,
  useSundaySchoolServantAttendance,
} from '@/lib/swr'
import {
  getLevelDisplayName,
  getMostRecentClassMeetingDate,
  getMostRecentSunday,
  getTodayDateInputValue,
  toDateInputValue,
} from '@/lib/sunday-school-class'
import type {
  SundaySchoolClass,
  SundaySchoolDashboard,
  SundaySchoolServantAttendanceResponse,
} from '@/types/sunday-school'

function ServantAttendanceContent() {
  const { session, status } = useSundaySchoolGuard()
  const router = useRouter()
  const searchParams = useSearchParams()
  const canOpenPage = session?.user?.sundaySchool?.hasAccess ?? false

  const { data: classesData, isLoading: classesLoading } = useSundaySchoolClasses()
  const classes = useMemo(
    () => ((classesData as SundaySchoolClass[] | undefined) ?? []).filter(
      cls => cls.isActive && cls.canViewServantAttendance
    ),
    [classesData]
  )

  const [selectedClassId, setSelectedClassId] = useState('')
  const [sessionDate, setSessionDate] = useState(toDateInputValue(getMostRecentSunday()))
  const [marks, setMarks] = useState<Record<string, SundaySchoolServantAttendanceStatus>>({})
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  useEffect(() => {
    if (status === 'authenticated' && !canOpenPage) {
      router.replace('/dashboard/servants')
    }
  }, [canOpenPage, router, status])

  useEffect(() => {
    if (selectedClassId || classes.length === 0) return
    const fromQuery = searchParams.get('classId')
    const match = fromQuery && classes.some(cls => cls.id === fromQuery)
      ? fromQuery
      : (classes.find(cls => cls.assignments.some(assignment => assignment.classId === cls.id))
          ?? classes[0]).id
    setSelectedClassId(match)
  }, [classes, searchParams, selectedClassId])

  const {
    data: attendanceData,
    isLoading: attendanceLoading,
    mutate: refreshAttendance,
  } = useSundaySchoolServantAttendance(
    canOpenPage ? selectedClassId : undefined,
    canOpenPage ? sessionDate : undefined
  )
  const attendance = attendanceData as SundaySchoolServantAttendanceResponse | undefined
  const canEdit = attendance?.canEdit ?? false
  const selectedClass = classes.find(cls => cls.id === selectedClassId)
  const selectedClassLevel = selectedClass?.level

  useEffect(() => {
    if (!selectedClassLevel) return
    setSessionDate(toDateInputValue(getMostRecentClassMeetingDate(selectedClassLevel)))
  }, [selectedClassId, selectedClassLevel])

  const {
    data: trendData,
    isLoading: trendLoading,
    isValidating: trendRefreshing,
    mutate: refreshTrend,
  } = useSundaySchoolDashboard(
    selectedClass?.academicYearId,
    selectedClassId || undefined,
    'servants'
  )
  const trendDashboard = trendData as SundaySchoolDashboard | undefined

  useEffect(() => {
    if (!attendance) return
    setMarks(Object.fromEntries(attendance.roster.flatMap(entry => {
      const status = entry.attendance?.status ?? (attendance.canEdit
        ? SundaySchoolServantAttendanceStatus.PRESENT
        : null)
      return status ? [[entry.userId, status]] : []
    })))
  }, [attendance])

  const presentCount = useMemo(
    () => Object.values(marks).filter(
      mark => mark === SundaySchoolServantAttendanceStatus.PRESENT
    ).length,
    [marks]
  )

  const handleSave = async () => {
    if (!attendance?.canEdit || !selectedClassId) return

    setSaving(true)
    try {
      const response = await fetch('/api/sunday-school/servant-attendance/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId: selectedClassId,
          date: sessionDate,
          records: attendance.roster.map(entry => ({
            servantId: entry.userId,
            status: marks[entry.userId] ?? SundaySchoolServantAttendanceStatus.PRESENT,
          })),
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Failed to save servant attendance')

      await Promise.all([refreshAttendance(), refreshTrend()])
      const saved = new Date()
      setLastSaved(saved)
      toast.success('Servant attendance saved', { description: saved.toLocaleString() })
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to save servant attendance')
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading' || classesLoading || (status === 'authenticated' && !canOpenPage)) {
    return <PageLoading />
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Servant attendance"
        meta={[canEdit ? 'Record which servants served each week' : 'Recorded servant attendance across classes', lastSaved ? <LastSaved key="saved" date={lastSaved} /> : null]}
      />

      {classes.length === 0 ? (
        <Panel>
          <EmptyState message="No active Sunday School classes are available." />
        </Panel>
      ) : (
        <>
          <Panel
            toolbar={
              <>
                <label className="flex items-center gap-2 text-xs font-medium text-ink-3">
                  Class
                  <FilterSelect
                    aria-label="Class"
                    value={selectedClassId}
                    onChange={setSelectedClassId}
                    options={classes.map((cls) => ({ value: cls.id, label: `${cls.name} — ${getLevelDisplayName(cls.level)}` }))}
                  />
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-ink-3">
                  Week of
                  <Input type="date" aria-label="Week of" value={sessionDate} max={getTodayDateInputValue()} onChange={(e) => setSessionDate(e.target.value)} className="w-40 md:h-8" />
                </label>
                {attendance && (
                  <span className="tabular text-[13px] text-ink-2 md:ml-auto">
                    <b className="font-semibold text-ok">{presentCount}</b> of {attendance.roster.length} present
                  </span>
                )}
              </>
            }
          >
            {attendanceLoading ? (
              <EmptyState message="Loading servant roster…" />
            ) : !attendance || attendance.roster.length === 0 ? (
              <EmptyState message="No active servants are assigned directly to this class." />
            ) : (
              <ul className="divide-y divide-line">
                {attendance.roster.map((entry) => {
                  const current = marks[entry.userId] ?? SundaySchoolServantAttendanceStatus.PRESENT
                  const recorded = entry.attendance?.status
                  return (
                    <li key={entry.userId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Initials name={entry.name} imageUrl={entry.profileImageUrl} />
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[13.5px] font-medium text-ink">{entry.name}</span>
                            {entry.authority === 'COORDINATOR' && <StatusBadge tone="gold" dot={false}>Coordinator</StatusBadge>}
                          </span>
                          <span className="truncate text-xs text-ink-3">{entry.email}</span>
                        </span>
                      </span>
                      {canEdit ? (
                        <Segmented
                          label={`Attendance for ${entry.name}`}
                          value={current}
                          onChange={(value) => setMarks((previous) => ({ ...previous, [entry.userId]: value }))}
                          options={[
                            { value: SundaySchoolServantAttendanceStatus.PRESENT, label: 'Present' },
                            { value: SundaySchoolServantAttendanceStatus.ABSENT, label: 'Absent' },
                          ]}
                        />
                      ) : recorded === SundaySchoolServantAttendanceStatus.PRESENT ? (
                        <StatusBadge tone="ok">Present</StatusBadge>
                      ) : recorded === SundaySchoolServantAttendanceStatus.ABSENT ? (
                        <StatusBadge tone="bad">Absent</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">Not recorded</StatusBadge>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          {attendance?.canEdit && attendance.roster.length > 0 && (
            <div className="sticky bottom-2 z-30 flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-[0_8px_24px_-12px_rgba(27,24,23,0.25)] md:bottom-4">
              <p className="tabular text-[13px] text-ink-2">
                <b className="font-semibold text-ok">{presentCount}</b> present · <b className="font-semibold text-bad">{attendance.roster.length - presentCount}</b> absent
              </p>
              <Button onClick={handleSave} disabled={saving} className="ml-auto">
                <Save />
                {saving ? 'Saving…' : 'Save attendance'}
              </Button>
            </div>
          )}

          {selectedClass && (
            <SundaySchoolRecentAttendanceChart
              trend={trendDashboard?.attendanceTrend}
              className={`${selectedClass.name} servants`}
              throughDate={sessionDate}
              isLoading={trendLoading || trendRefreshing}
            />
          )}
        </>
      )}
    </div>
  )
}

export default function ServantAttendancePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ServantAttendanceContent />
    </Suspense>
  )
}
