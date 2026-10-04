'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FilterSelect } from '@/components/ui/filter-select'
import { LastSaved } from '@/components/ui/last-saved'
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { Initials } from '@/components/ds/person'
import { AttendanceLegend, AttendanceStatusButtons } from '@/components/attendance-status-buttons'
import { SundaySchoolRecentAttendanceChart } from '@/components/sunday-school-recent-attendance-chart'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'
import { useSundaySchoolClasses, useSundaySchoolDashboard } from '@/lib/swr'
import {
  organizeAttendanceRoster,
  type AttendanceRosterNameOrder,
} from '@/lib/attendance-roster'
import {
  getChildFullName,
  getChildPhotoUrl,
  getLevelDisplayName,
  getMostRecentClassMeetingDate,
  getMostRecentSunday,
  getTodayDateInputValue,
  toDateInputValue,
} from '@/lib/sunday-school-class'
import type {
  SundaySchoolChild,
  SundaySchoolClass,
  SundaySchoolRosterEntry,
  SundaySchoolDashboard,
  SundaySchoolSession,
  SundaySchoolSessionAttendance,
} from '@/types/sunday-school'
import { AttendanceStatus } from '@prisma/client'
import Link from 'next/link'
import { Users } from 'lucide-react'

function normalizeSundaySchoolAttendanceStatus(status?: AttendanceStatus | null) {
  if (
    status === AttendanceStatus.PRESENT ||
    status === AttendanceStatus.LATE ||
    status === AttendanceStatus.ABSENT
  ) {
    return status
  }
  return undefined
}

function SundaySchoolAttendanceContent() {
  const { status } = useSundaySchoolGuard()
  const searchParams = useSearchParams()

  const { data: classesData, isLoading: classesLoading } = useSundaySchoolClasses()
  const classes = useMemo(() => (classesData as SundaySchoolClass[] | undefined) ?? [], [classesData])

  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [sessionDate, setSessionDate] = useState<string>(toDateInputValue(getMostRecentSunday()))
  const [attendance, setAttendance] = useState<SundaySchoolSessionAttendance | null>(null)
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({})
  const [loadingSession, setLoadingSession] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [nameOrder, setNameOrder] = useState<AttendanceRosterNameOrder>('last')
  const [showPhotos, setShowPhotos] = useState(true)
  const [groupByGender, setGroupByGender] = useState(false)

  // The server decides per class whether this person may record attendance
  const selectedClass = classes.find(c => c.id === selectedClassId)
  const selectedClassLevel = selectedClass?.level
  const canEdit = selectedClass?.canServe ?? false
  const {
    data: trendData,
    isLoading: trendLoading,
    isValidating: trendRefreshing,
    mutate: refreshTrend,
  } = useSundaySchoolDashboard(
    selectedClass?.academicYearId,
    selectedClassId || undefined,
    'children'
  )
  const trendDashboard = trendData as SundaySchoolDashboard | undefined

  // Preselect the class from the dashboard link, else the first one available
  useEffect(() => {
    if (selectedClassId || classes.length === 0) return
    const fromQuery = searchParams.get('classId')
    const match = fromQuery && classes.some(c => c.id === fromQuery) ? fromQuery : classes[0].id
    setSelectedClassId(match)
  }, [classes, searchParams, selectedClassId])

  useEffect(() => {
    if (!selectedClassLevel) return
    setSessionDate(toDateInputValue(getMostRecentClassMeetingDate(selectedClassLevel)))
  }, [selectedClassId, selectedClassLevel])

  // Load the roster for the selected class + date. Read-only: the session row
  // is only created on save, so browsing dates never leaves empty sessions
  // behind (and PRIEST, who cannot write, can still look).
  const loadSession = useCallback(async () => {
    if (!selectedClassId || !sessionDate) return

    setLoadingSession(true)
    try {
      const sessionsRes = await fetch(
        `/api/sunday-school/sessions?classId=${selectedClassId}&from=${sessionDate}&to=${sessionDate}`
      )
      const sessionsBody = await sessionsRes.json()
      if (!sessionsRes.ok) {
        throw new Error(sessionsBody.error || 'Failed to look up the session')
      }

      const existing = (sessionsBody as SundaySchoolSession[])[0]

      if (existing) {
        const attendanceRes = await fetch(`/api/sunday-school/sessions/${existing.id}/attendance`)
        const attendanceBody = await attendanceRes.json()
        if (!attendanceRes.ok) {
          throw new Error(attendanceBody.error || 'Failed to load the roster')
        }
        const loaded = attendanceBody as SundaySchoolSessionAttendance
        setAttendance(loaded)
        setLoadError(false)
        const savedMarks: Record<string, AttendanceStatus> = {}
        for (const entry of loaded.roster) {
          const savedStatus = normalizeSundaySchoolAttendanceStatus(entry.attendance?.status)
          if (savedStatus) savedMarks[entry.id] = savedStatus
        }
        setMarks(savedMarks)
        return
      }

      // No session recorded for this date yet — show the class roster unmarked
      const childrenRes = await fetch(`/api/sunday-school/children?classId=${selectedClassId}&isActive=true`)
      const childrenBody = await childrenRes.json()
      if (!childrenRes.ok) {
        throw new Error(childrenBody.error || 'Failed to load the roster')
      }

      const roster: SundaySchoolRosterEntry[] = (childrenBody as SundaySchoolChild[]).map(child => ({
        id: child.id,
        firstName: child.firstName,
        lastName: child.lastName,
        level: child.level,
        gender: child.gender,
        profileImageUrl: getChildPhotoUrl(child),
        attendance: null,
      }))

      setAttendance({ session: null, roster })
      setMarks({})
      setLoadError(false)
    } catch (error: unknown) {
      setAttendance(null)
      setMarks({})
      setLoadError(true)
      toast.error(error instanceof Error ? error.message : 'Failed to load attendance')
    } finally {
      setLoadingSession(false)
    }
  }, [selectedClassId, sessionDate])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  const handleSave = async () => {
    if (!attendance) return

    // Mark who's here; anyone left unmarked is saved as absent
    const finalMarks: Record<string, AttendanceStatus> = Object.fromEntries(
      attendance.roster.map(entry => [entry.id, marks[entry.id] ?? AttendanceStatus.ABSENT])
    )

    setSaving(true)
    try {
      // Create the session on first save (the route is idempotent, so a
      // re-save of an existing date reuses it)
      const sessionRes = await fetch('/api/sunday-school/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId: selectedClassId, date: sessionDate }),
      })
      const sessionBody = await sessionRes.json()
      if (!sessionRes.ok) {
        throw new Error(sessionBody.error || 'Failed to open the session')
      }

      const res = await fetch('/api/sunday-school/attendance/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionBody.id,
          records: attendance.roster.map(entry => ({
            childId: entry.id,
            status: finalMarks[entry.id],
          })),
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.error || 'Failed to save attendance')
      }

      const saved = new Date()
      setMarks(finalMarks)
      setLastSaved(saved)
      setAttendance(prev => (prev ? { ...prev, session: sessionBody } : prev))
      void refreshTrend()
      toast.success('Attendance saved', { description: saved.toLocaleString() })
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to save attendance')
    } finally {
      setSaving(false)
    }
  }

  const presentCount = useMemo(
    () => Object.values(marks).filter(s => s === AttendanceStatus.PRESENT || s === AttendanceStatus.LATE).length,
    [marks]
  )
  const unmarkedCount = attendance?.roster.filter(entry => !marks[entry.id]).length ?? 0
  const rosterGroups = useMemo(
    () => organizeAttendanceRoster(attendance?.roster ?? [], { nameOrder, groupByGender }),
    [attendance?.roster, groupByGender, nameOrder]
  )

  if (status === 'loading' || classesLoading) {
    return <PageLoading />
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Take attendance"
        meta={['Mark who’s here; anyone not marked is saved as absent', lastSaved ? <LastSaved key="saved" date={lastSaved} /> : null]}
        actions={
          selectedClassId && (
            <Button asChild variant="outline">
              <Link href={`/dashboard/servants/roster?classId=${selectedClassId}`}>
                <Users />
                Roster
              </Link>
            </Button>
          )
        }
      />

      {classes.length === 0 ? (
        <Panel>
          <EmptyState message="You are not assigned to a Sunday School class yet. Ask your coordinator to add you." />
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
                  <Input
                    type="date"
                    aria-label="Week of"
                    value={sessionDate}
                    max={getTodayDateInputValue()}
                    onChange={(e) => setSessionDate(e.target.value)}
                    className="w-40 md:h-8"
                  />
                </label>
                <div className="flex w-full flex-wrap items-center gap-3 lg:ml-auto lg:w-auto">
                  <FilterSelect
                    aria-label="Alphabetize by"
                    value={nameOrder}
                    onChange={(v) => setNameOrder(v as AttendanceRosterNameOrder)}
                    options={[
                      { value: 'last', label: 'Sort by last name' },
                      { value: 'first', label: 'Sort by first name' },
                    ]}
                  />
                  <label className="flex min-h-11 items-center gap-2 text-[13px] text-ink-2 md:min-h-8">
                    <input type="checkbox" checked={showPhotos} onChange={(e) => setShowPhotos(e.target.checked)} className="size-4 accent-brand" />
                    Photos
                  </label>
                  <label className="flex min-h-11 items-center gap-2 text-[13px] text-ink-2 md:min-h-8">
                    <input type="checkbox" checked={groupByGender} onChange={(e) => setGroupByGender(e.target.checked)} className="size-4 accent-brand" />
                    Group by gender
                  </label>
                </div>
              </>
            }
          >
            <div className="border-b border-line px-4 py-2.5">
              <AttendanceLegend showExcused={false} />
            </div>
            {loadingSession ? (
              <EmptyState message="Loading roster…" />
            ) : loadError ? (
              <EmptyState title="Couldn’t load this roster" message="Something went wrong on our side. Pick the class again or try in a moment." />
            ) : !attendance || attendance.roster.length === 0 ? (
              <EmptyState message="No children on this roster yet. Add them from the Roster page." />
            ) : (
              <div>
                {rosterGroups.map((group) => (
                  <section key={group.key}>
                    {group.label && (
                      <h3 className="flex items-center gap-2 border-b border-line bg-hover/40 px-4 py-1.5 text-xs font-semibold text-ink-2">
                        {group.label}
                        <span className="tabular font-normal text-ink-3">{group.entries.length}</span>
                      </h3>
                    )}
                    <ul className="divide-y divide-line">
                      {group.entries.map((entry) => (
                        <li key={entry.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5">
                          <span className="flex min-w-0 items-center gap-2.5">
                            {showPhotos && <Initials name={getChildFullName(entry)} imageUrl={entry.profileImageUrl} size={32} />}
                            <span className="flex min-w-0 flex-col leading-tight">
                              <span className="truncate text-[14px] font-medium text-ink">{getChildFullName(entry)}</span>
                              <span className="text-xs text-ink-3">{getLevelDisplayName(entry.level)}</span>
                            </span>
                          </span>
                          <AttendanceStatusButtons
                            currentStatus={marks[entry.id]}
                            onStatusChange={(statusValue) => setMarks((prev) => ({ ...prev, [entry.id]: statusValue as AttendanceStatus }))}
                            disabled={!canEdit}
                            showExcused={false}
                            absentLabel="Not present"
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </Panel>

          {canEdit && attendance && attendance.roster.length > 0 && (
            <div className="sticky bottom-2 z-30 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-[0_8px_24px_-12px_rgba(27,24,23,0.25)] md:bottom-4">
              <p className="tabular text-[13px] text-ink-2" aria-live="polite">
                <b className="font-semibold text-ok">{presentCount}</b> of {attendance.roster.length} here
                {unmarkedCount > 0 && <span className="ml-2 text-ink-3">· {unmarkedCount} not marked will be saved as absent</span>}
              </p>
              <Button onClick={handleSave} disabled={saving} className="ml-auto">
                {saving ? 'Saving…' : 'Save attendance'}
              </Button>
            </div>
          )}

          {selectedClass && (
            <SundaySchoolRecentAttendanceChart
              trend={trendDashboard?.attendanceTrend}
              className={selectedClass.name}
              throughDate={sessionDate}
              isLoading={trendLoading || trendRefreshing}
            />
          )}
        </>
      )}
    </div>
  )
}

export default function SundaySchoolAttendancePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <SundaySchoolAttendanceContent />
    </Suspense>
  )
}
