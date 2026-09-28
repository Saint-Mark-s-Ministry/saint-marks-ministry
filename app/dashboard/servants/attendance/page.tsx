'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/admin/page-header'
import { AttendanceStatusButtons } from '@/components/attendance-status-buttons'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { SundaySchoolRecentAttendanceChart } from '@/components/sunday-school-recent-attendance-chart'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'
import { useSundaySchoolClasses, useSundaySchoolDashboard } from '@/lib/swr'
import {
  organizeAttendanceRoster,
  type AttendanceRosterNameOrder,
} from '@stmark/domain'
import {
  getChildFullName,
  getLevelDisplayName,
  getMostRecentClassMeetingDate,
  getMostRecentSunday,
  getTodayDateInputValue,
  isSessionDateToday,
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
import { Save } from 'lucide-react'

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
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [nameOrder, setNameOrder] = useState<AttendanceRosterNameOrder>('last')
  const [showPhotos, setShowPhotos] = useState(true)
  const [groupByGender, setGroupByGender] = useState(false)

  // The server decides per class whether this person may record attendance
  const selectedClass = classes.find(c => c.id === selectedClassId)
  const selectedClassLevel = selectedClass?.level
  const canEdit = (selectedClass?.canServe ?? false) && isSessionDateToday(sessionDate)
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
        profileImageUrl: child.user?.profileImageUrl ?? null,
        attendance: null,
      }))

      setAttendance({ session: null, roster })
      setMarks({})
    } catch (error: unknown) {
      setAttendance(null)
      setMarks({})
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

    const unmarkedCount = attendance.roster.filter(entry => !marks[entry.id]).length
    if (unmarkedCount > 0) {
      toast.error(
        `Select attendance for ${unmarkedCount} ${unmarkedCount === 1 ? 'child' : 'children'} before saving`
      )
      return
    }

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
            status: marks[entry.id]!,
          })),
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.error || 'Failed to save attendance')
      }

      const saved = new Date()
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
  const rosterGroups = useMemo(
    () => organizeAttendanceRoster(attendance?.roster ?? [], { nameOrder, groupByGender }),
    [attendance?.roster, groupByGender, nameOrder]
  )
  const unmarkedCount = attendance?.roster.filter(entry => !marks[entry.id]).length ?? 0

  if (status === 'loading' || classesLoading) {
    return <PageLoading />
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Take Attendance"
          description="Select a status for every child before saving this week's attendance."
          lastSaved={lastSaved}
          actions={
            canEdit && attendance ? (
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-1" />
                {saving ? 'Saving…' : 'Save'}
              </Button>
            ) : undefined
          }
        />

        {classes.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <EmptyState message="You are not assigned to any Sunday School class yet." />
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="class">Class</Label>
                  <select
                    id="class"
                    value={selectedClassId}
                    onChange={e => setSelectedClassId(e.target.value)}
                    className="w-full h-9 rounded-md border px-3 text-sm bg-white dark:bg-gray-900 dark:border-gray-700"
                  >
                    {classes.map(cls => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} — {getLevelDisplayName(cls.level)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Week of</Label>
                  <Input
                    id="date"
                    type="date"
                    value={sessionDate}
                    max={getTodayDateInputValue()}
                    onChange={e => setSessionDate(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {!isSessionDateToday(sessionDate) && (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Past attendance is read-only. Attendance can only be changed on the session date.
              </p>
            )}

            {selectedClass && (
              <SundaySchoolRecentAttendanceChart
                trend={trendDashboard?.attendanceTrend}
                className={selectedClass.name}
                throughDate={sessionDate}
                isLoading={trendLoading || trendRefreshing}
              />
            )}

            <Card>
              <CardHeader>
                <CardTitle>
                  {selectedClass?.name ?? 'Roster'}
                  {attendance && (
                    <span className="ml-2 text-sm font-normal text-gray-600 dark:text-gray-400">
                      {presentCount} of {attendance.roster.length} here
                      {unmarkedCount > 0 && ` · ${unmarkedCount} unmarked`}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {attendance && attendance.roster.length > 0 && (
                  <div className="mb-4 grid gap-4 rounded-lg border bg-gray-50 p-4 sm:grid-cols-3 dark:border-gray-800 dark:bg-gray-900/50">
                    <div className="space-y-2">
                      <Label htmlFor="attendance-name-order">Alphabetize by</Label>
                      <select
                        id="attendance-name-order"
                        value={nameOrder}
                        onChange={event => setNameOrder(event.target.value as AttendanceRosterNameOrder)}
                        className="h-9 w-full rounded-md border bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                      >
                        <option value="last">Last name</option>
                        <option value="first">First name</option>
                      </select>
                    </div>
                    <label className="flex min-h-9 items-center gap-2 self-end text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={showPhotos}
                        onChange={event => setShowPhotos(event.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 accent-primary"
                      />
                      Include photos
                    </label>
                    <label className="flex min-h-9 items-center gap-2 self-end text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={groupByGender}
                        onChange={event => setGroupByGender(event.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 accent-primary"
                      />
                      Group roster by gender
                    </label>
                  </div>
                )}
                {loadingSession ? (
                  <p className="text-center py-8 text-gray-500">Loading roster…</p>
                ) : !attendance || attendance.roster.length === 0 ? (
                  <EmptyState message="No children on this roster yet. Add them from the Children page." />
                ) : (
                  <div className="space-y-5">
                    {rosterGroups.map(group => (
                      <section key={group.key}>
                        {group.label && (
                          <div className="mb-1 flex items-center gap-2 border-b pb-2 dark:border-gray-800">
                            <h3 className="font-semibold">{group.label}</h3>
                            <Badge variant="secondary">{group.entries.length}</Badge>
                          </div>
                        )}
                        <div className="divide-y dark:divide-gray-800">
                          {group.entries.map(entry => (
                            <div key={entry.id} className="flex items-center justify-between gap-3 py-3">
                              <div className="flex min-w-0 items-center gap-3">
                                {showPhotos && (
                                  <Avatar className="h-10 w-10 shrink-0">
                                    {entry.profileImageUrl && (
                                      <AvatarImage src={entry.profileImageUrl} alt={getChildFullName(entry)} />
                                    )}
                                    <AvatarFallback>
                                      {(entry.firstName[0] ?? '') + (entry.lastName[0] ?? '')}
                                    </AvatarFallback>
                                  </Avatar>
                                )}
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{getChildFullName(entry)}</p>
                                  <Badge variant="secondary" className="mt-1">
                                    {getLevelDisplayName(entry.level)}
                                  </Badge>
                                </div>
                              </div>
                              <AttendanceStatusButtons
                                currentStatus={marks[entry.id]}
                                onStatusChange={statusValue =>
                                  setMarks(prev => ({ ...prev, [entry.id]: statusValue as AttendanceStatus }))
                                }
                                disabled={!canEdit}
                                showExcused={false}
                                absentLabel="Not present"
                              />
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
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
