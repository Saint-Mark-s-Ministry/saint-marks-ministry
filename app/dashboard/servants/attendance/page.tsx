'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
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
import { useSundaySchoolAttendance } from '@/hooks/useSundaySchoolAttendance'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'
import { useSundaySchoolAgeGroups, useSundaySchoolClasses, useSundaySchoolDashboard } from '@/lib/swr'
import {
  organizeAttendanceRoster,
  type AttendanceRosterNameOrder,
} from '@/lib/attendance-roster'
import {
  getChildFullName,
  getLevelDisplayName,
  getMostRecentClassMeetingDate,
  getMostRecentSunday,
  getTodayDateInputValue,
  sortClassesByAgeGroup,
  toDateInputValue,
} from '@/lib/sunday-school-class'
import type {
  SundaySchoolClass,
  SundaySchoolDashboard,
} from '@/types/sunday-school'
import { AttendanceStatus, SundaySchoolLevel } from '@prisma/client'
import Link from 'next/link'
import { Users } from 'lucide-react'

function SundaySchoolAttendanceContent() {
  const { session, status } = useSundaySchoolGuard()
  const searchParams = useSearchParams()

  const { data: classesData, isLoading: classesLoading } = useSundaySchoolClasses()
  const { data: ageGroupsData } = useSundaySchoolAgeGroups()
  const classes = useMemo(() => sortClassesByAgeGroup(
    (classesData as SundaySchoolClass[] | undefined) ?? [],
    (ageGroupsData as Array<{ levels: SundaySchoolLevel[]; name: string }> | undefined) ?? []
  ), [ageGroupsData, classesData])

  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [sessionDate, setSessionDate] = useState<string>(toDateInputValue(getMostRecentSunday()))
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

  const editor = useSundaySchoolAttendance(status === 'authenticated' ? session?.user?.id ?? '' : '', selectedClassId, sessionDate, canEdit)
  const { attendance, marks, loading: loadingSession, error: loadError, saving, lastSaved } = editor
  const handleSave = async () => {
    await editor.save()
  }
  const pendingCount = Object.keys(editor.pending).length
  useEffect(() => {
    if (lastSaved) void refreshTrend()
  }, [lastSaved, refreshTrend])

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
        meta={['Marks save automatically; Save attendance also marks anyone left unmarked absent', lastSaved && !pendingCount ? <LastSaved key="saved" date={lastSaved} /> : null]}
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
          {canEdit && (pendingCount > 0 || editor.storageError || editor.removedCount > 0) && (
            <div role="status" className="rounded-lg border border-line bg-surface p-4 text-sm text-ink-2">
              {editor.storageError
                ? 'This browser could not store or clear the local draft. Keep this page open until you save successfully; refreshing may lose changes or restore an older draft.'
                : pendingCount > 0 ? `${editor.recovered ? 'Recovered draft. ' : ''}${pendingCount} marks kept on this device, pending save to the church.` : null}
              {editor.recovered && ' Review the marks, then resume saving when connected.'}
              {editor.removedCount > 0 && ` ${editor.removedCount} draft marks belong to children no longer on this roster and will not be submitted.`}
              {editor.recovered && pendingCount > 0 && <Button variant="outline" className="ml-3" disabled={saving} onClick={() => void editor.save(false)}>Resume saving marks</Button>}
            </div>
          )}
          {editor.saveError && <p role="alert" className="text-sm text-danger">{editor.saveError}. Attendance has not been confirmed saved. Your marks are kept on this page. Reconnect to retry. <Button variant="outline" disabled={saving} onClick={() => void editor.save(false)}>Retry pending marks</Button> <Button variant="outline" disabled={saving} onClick={editor.retryLoad}>Reload roster and recover marks</Button></p>}
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
              <div className="p-4"><EmptyState title="Couldn’t load this roster" message={`${loadError}. Any saved local draft is kept. Reconnect and try again.`} /><Button variant="outline" onClick={editor.retryLoad}>Retry loading roster</Button></div>
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
                            onStatusChange={(statusValue) => editor.mark(entry.id, statusValue as AttendanceStatus)}
                            disabled={!canEdit || editor.finalizing || loadingSession}
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
              <span role="status" className="text-xs text-ink-3">{saving ? 'Saving marks…' : pendingCount ? `${pendingCount} pending` : lastSaved ? 'All entered marks saved to the church' : 'No changes yet'}</span>
              <Button onClick={handleSave} disabled={saving || loadingSession || !session?.user?.id} className="ml-auto">
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
