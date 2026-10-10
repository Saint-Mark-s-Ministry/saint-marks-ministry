'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ClipboardCheck, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ds/page-header'
import { KpiStrip } from '@/components/ds/kpi-strip'
import { Panel } from '@/components/ds/panel'
import { Segmented } from '@/components/ds/segmented'
import { Metric } from '@/components/ds/metric'
import { StatusBadge } from '@/components/ds/status-badge'
import { EventLegend, MonthCalendar, utcDayKey, type CalendarEvent } from '@/components/ds/calendar'
import { SundaySchoolAttendanceChart } from '@/components/sunday-school-attendance-chart'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'
import { useSundaySchoolDashboard, useSundaySchoolLessons } from '@/lib/swr'
import { formatUTC } from '@/lib/utils'
import {
  compareAgeGroupsByLevel,
  compareClassesByLevelAndName,
  getLevelDisplayName,
} from '@/lib/sunday-school-class'
import type {
  SundaySchoolAttendanceAudience,
  SundaySchoolClassSummary,
  SundaySchoolDashboard,
  SundaySchoolWeeklyLessonsResponse,
} from '@/types/sunday-school'

const UNBANDED = '__unbanded__'

export default function SundaySchoolDashboardPage() {
  const { status } = useSundaySchoolGuard()
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>()
  const [selectedClassId, setSelectedClassId] = useState<string>()
  const [attendanceAudience, setAttendanceAudience] = useState<SundaySchoolAttendanceAudience>('children')
  const { data, isLoading, isValidating } = useSundaySchoolDashboard(
    selectedAcademicYearId,
    selectedClassId,
    attendanceAudience,
    { keepPreviousData: true }
  )

  const dashboard = data as SundaySchoolDashboard | undefined
  const [month, setMonth] = useState(() => new Date())
  const [classView, setClassView] = useState<'all' | 'mine' | 'due'>('all')
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1)
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const { data: lessonsData } = useSundaySchoolLessons({
    from: utcDayKey(new Date(Date.UTC(monthStart.getFullYear(), monthStart.getMonth(), 1 - 7))),
    to: utcDayKey(new Date(Date.UTC(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate() + 7))),
  })
  const weeklyLessons = useMemo(() => (lessonsData as SundaySchoolWeeklyLessonsResponse | undefined)?.lessons ?? [], [lessonsData])

  // One calendar chip per Sunday: the lesson title when there is one class, else a count.
  const events = useMemo<CalendarEvent[]>(() => {
    const byDay = new Map<string, typeof weeklyLessons>()
    for (const l of weeklyLessons) {
      const day = utcDayKey(l.sundayDate)
      byDay.set(day, [...(byDay.get(day) ?? []), l])
    }
    return [...byDay.entries()].map(([day, list]) => ({
      id: `ss-${day}`,
      day,
      type: 'sunday-lesson' as const,
      title: list.length === 1 ? list[0].title || list[0].class.name : `${list.length} class lessons`,
      meta: `${list.filter((l) => l.status === 'READY').length} of ${list.length} ready`,
      href: '/dashboard/servants/lessons',
    }))
  }, [weeklyLessons])

  // An age-group coordinator runs several classes, so group the list by band.
  // A servant with one class sees a single group and never notices.
  const grouped = useMemo(() => {
    const classes = dashboard?.classes ?? []
    const buckets = new Map<string, { name: string; classes: SundaySchoolClassSummary[] }>()

    for (const cls of classes) {
      const key = cls.ageGroup?.id ?? UNBANDED
      const name = cls.ageGroup?.name ?? 'Other classes'
      if (!buckets.has(key)) buckets.set(key, { name, classes: [] })
      buckets.get(key)!.classes.push(cls)
    }

    for (const bucket of buckets.values()) {
      bucket.classes.sort(compareClassesByLevelAndName)
    }

    const order = [...(dashboard?.ageGroups ?? [])]
      .sort(compareAgeGroupsByLevel)
      .map(group => group.id)
    return Array.from(buckets.entries()).sort((a, b) => {
      const ai = order.indexOf(a[0])
      const bi = order.indexOf(b[0])
      return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi)
    })
  }, [dashboard])

  if (status === 'loading' || isLoading) {
    return <PageLoading />
  }

  const totals = dashboard?.totals
  const standing = dashboard?.standing
  const classCount = dashboard?.classes.length ?? 0
  const singleClass = classCount === 1 ? dashboard?.classes[0] : undefined
  const attendanceHref = singleClass
    ? `/dashboard/servants/attendance?classId=${singleClass.id}`
    : '/dashboard/servants/attendance'

  const classes = dashboard?.classes ?? []
  const due = classes.filter((c) => c.canServe && !c.attendanceTakenThisWeek)
  const servants = new Set(classes.flatMap((c) => c.servants.map((sv) => sv.id))).size
  const withSessions = classes.filter((c) => c.sessionCount > 0)
  const totalKids = withSessions.reduce((n, c) => n + c.childCount, 0)
  const ytd = totalKids > 0 ? withSessions.reduce((n, c) => n + c.attendancePercentage * c.childCount, 0) / totalKids : null
  const weekOf = dashboard?.weekOf
  const thisWeek = weekOf ? weeklyLessons.filter((l) => utcDayKey(l.sundayDate) >= utcDayKey(weekOf)).sort((a, b) => a.sundayDate.localeCompare(b.sundayDate)) : []
  const nextSunday = thisWeek[0] ? utcDayKey(thisWeek[0].sundayDate) : null
  const sundayLessons = nextSunday ? thisWeek.filter((l) => utcDayKey(l.sundayDate) === nextSunday) : []
  const visibleBands = grouped
    .map(([key, band]) => [
      key,
      {
        ...band,
        classes: band.classes.filter((c) => (classView === 'mine' ? c.canServe : classView === 'due' ? c.canServe && !c.attendanceTakenThisWeek : true)),
      },
    ] as const)
    .filter(([, band]) => band.classes.length > 0)

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Sunday School"
        meta={[dashboard?.attendanceTrend?.academicYears.find((y) => y.id === dashboard.attendanceTrend.selectedAcademicYearId)?.name.replace('-', '–'), 'St. Mark Coptic Orthodox Church']}
        actions={
          <>
            {standing?.isAdmin && (
              <Button asChild variant="outline">
                <Link href="/dashboard/servants/age-groups">
                  <Layers />
                  Age groups
                </Link>
              </Button>
            )}
            <Button asChild>
              <Link href={attendanceHref}>
                <ClipboardCheck />
                Take attendance
              </Link>
            </Button>
          </>
        }
      />

      <KpiStrip
        items={[
          { label: 'Classes', value: totals?.classes ?? 0, hint: `across ${dashboard?.ageGroups.length ?? 0} age groups` },
          { label: 'Children', value: totals?.children ?? 0, hint: 'enrolled this year' },
          {
            label: 'Need attendance',
            value: totals?.classesNeedingAttendance ?? 0,
            hint: weekOf ? `classes from ${formatUTC(weekOf, { month: 'short', day: 'numeric' })}` : 'this week',
            tone: (totals?.classesNeedingAttendance ?? 0) > 0 ? 'warn' : undefined,
          },
          { label: 'Attendance', value: ytd === null ? '—' : `${ytd.toFixed(0)}%`, hint: 'children, year to date' },
          { label: 'Servants', value: servants, hint: 'assigned to classes' },
        ]}
      />

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="Calendar" actions={<EventLegend types={['sunday-lesson']} />} className="hidden md:block">
          <MonthCalendar month={month} events={events} onMonthChange={setMonth} />
        </Panel>

        <Panel
          title="This Sunday"
          description={nextSunday ? formatUTC(nextSunday, { weekday: 'long', month: 'long', day: 'numeric' }) : undefined}
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/servants/lessons">Lessons</Link>
            </Button>
          }
        >
          {sundayLessons.length > 0 ? (
            <ul className="divide-y divide-line">
              {sundayLessons.slice(0, 4).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[13.5px] font-medium text-ink">{l.title || 'Lesson not chosen yet'}</span>
                    <span className="truncate text-xs text-ink-3">{l.class.name}</span>
                  </span>
                  {l.status === 'READY' ? <StatusBadge tone="ok">Ready</StatusBadge> : l.status === 'NEEDS_LINKS' ? <StatusBadge tone="warn">Needs links</StatusBadge> : <StatusBadge tone="neutral">Unassigned</StatusBadge>}
                </li>
              ))}
              {sundayLessons.length > 4 && <li className="px-4 py-2 text-xs text-ink-3">+{sundayLessons.length - 4} more classes</li>}
            </ul>
          ) : (
            <EmptyState message="No weekly lessons scheduled yet." />
          )}
          {due.length > 0 && (
            <div className="border-t border-line">
              <p className="px-4 pt-3 text-xs font-medium tracking-[0.06em] text-warn uppercase">
                Attendance still open{weekOf ? ` · ${formatUTC(weekOf, { month: 'short', day: 'numeric' })}` : ''}
              </p>
              <ul className="py-1">
                {due.slice(0, 6).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-1.5">
                    <span className="truncate text-[13px] text-ink">
                      {c.name} <span className="text-ink-3">· {c.ageGroup?.name ?? getLevelDisplayName(c.level)}</span>
                    </span>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/dashboard/servants/attendance?classId=${c.id}`}>Take</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      {classCount === 0 ? (
        <Panel>
          <EmptyState
            message={
              standing?.isAdmin
                ? 'No classes yet. Create one to start building a roster and taking attendance.'
                : 'You have not been assigned to a Sunday School class yet. Ask your coordinator or a super admin to add you.'
            }
          />
        </Panel>
      ) : (
        <Panel
          title="Classes"
          description={`${classCount} classes · grouped by age group`}
          actions={
            <Segmented
              label="Classes"
              value={classView}
              onChange={setClassView}
              options={[
                { value: 'all', label: 'All' },
                { value: 'mine', label: 'Mine' },
                { value: 'due', label: 'Attendance due', count: due.length },
              ]}
            />
          }
        >
          {visibleBands.length === 0 ? (
            <EmptyState message={classView === 'due' ? 'Every class you serve has attendance this week.' : 'No classes here.'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] text-ink">
                <thead className="bg-raised">
                  <tr className="border-b border-line text-left text-xs text-ink-3">
                    <th scope="col" className="h-9 px-4 font-medium">Class</th>
                    <th scope="col" className="hidden px-3 font-medium md:table-cell">Level</th>
                    <th scope="col" className="w-20 px-3 text-right font-medium">Children</th>
                    <th scope="col" className="hidden px-3 font-medium lg:table-cell">Servants</th>
                    <th scope="col" className="hidden w-40 px-3 font-medium md:table-cell">Attendance</th>
                    <th scope="col" className="w-28 px-3 font-medium">This week</th>
                    <th scope="col" className="w-36"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                {visibleBands.map(([key, band]) => (
                  <tbody key={key}>
                    <tr className="border-b border-line bg-hover/40">
                      <th scope="rowgroup" colSpan={7} className="px-4 py-1.5 text-left text-xs font-semibold text-ink-2">{band.name}</th>
                    </tr>
                    {band.classes.map((cls) => (
                      <tr key={cls.id} className="h-11 border-b border-line last:border-0 hover:bg-hover/60">
                        <td className="px-4">
                          <Link href={`/dashboard/servants/classes/${cls.id}`} className="font-medium text-ink no-underline hover:underline">
                            {cls.name}
                          </Link>
                          {cls.canCoordinate && !standing?.isAdmin && <StatusBadge tone="gold" dot={false} className="ml-2">Coordinator</StatusBadge>}
                        </td>
                        <td className="hidden px-3 text-ink-2 md:table-cell">{getLevelDisplayName(cls.level)}</td>
                        <td className="tabular px-3 text-right">{cls.childCount}</td>
                        <td className="hidden max-w-56 truncate px-3 text-ink-2 lg:table-cell" title={cls.servants.map((sv) => sv.name).join(', ')}>
                          {cls.servants.length === 0 ? <span className="text-ink-3">None</span> : cls.servants.map((sv) => sv.name.split(' ')[0]).join(', ')}
                        </td>
                        <td className="hidden px-3 md:table-cell">{cls.sessionCount > 0 ? <Metric value={cls.attendancePercentage} width={48} /> : <span className="text-ink-3">—</span>}</td>
                        <td className="px-3">
                          {cls.attendanceTakenThisWeek ? <StatusBadge tone="ok">Taken</StatusBadge> : <StatusBadge tone="warn">Due</StatusBadge>}
                        </td>
                        <td className="px-3">
                          <span className="flex justify-end gap-1">
                            <Button asChild variant="ghost" size="sm">
                              <Link href={`/dashboard/servants/roster?classId=${cls.id}`}>Roster</Link>
                            </Button>
                            {cls.canServe && (
                              <Button asChild variant="outline" size="sm">
                                <Link href={`/dashboard/servants/attendance?classId=${cls.id}`}>Attendance</Link>
                              </Button>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          )}
        </Panel>
      )}

      {dashboard?.attendanceTrend && (
        <SundaySchoolAttendanceChart
          trend={dashboard.attendanceTrend}
          selectedAcademicYearId={selectedAcademicYearId}
          selectedClassId={selectedClassId}
          audience={attendanceAudience}
          onAcademicYearChange={(academicYearId) => {
            setSelectedAcademicYearId(academicYearId)
            setSelectedClassId(undefined)
            setAttendanceAudience('children')
          }}
          onClassChange={setSelectedClassId}
          onAudienceChange={(audience) => {
            setAttendanceAudience(audience)
            setSelectedClassId(undefined)
          }}
          isRefreshing={isValidating && !isLoading}
        />
      )}
    </div>
  )
}
