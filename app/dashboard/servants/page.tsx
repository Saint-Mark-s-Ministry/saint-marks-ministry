'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { BookOpen, CalendarCheck, Check, ClipboardCheck, HeartHandshake, NotebookPen } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { Segmented } from '@/components/ds/segmented'
import { Metric } from '@/components/ds/metric'
import { StatusBadge } from '@/components/ds/status-badge'
import {
  Agenda,
  EventLegend,
  localDayKey,
  MonthCalendar,
  monthGridDays,
  nextDays,
  utcDayKey,
  type CalendarEvent,
} from '@/components/ds/calendar'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'
import { useSundaySchoolDashboard, useSundaySchoolHomework, useSundaySchoolLessons, useSundaySchoolVisitations } from '@/lib/swr'
import { formatUTC, cn } from '@/lib/utils'
import {
  compareAgeGroupsByLevel,
  compareClassesByLevelAndName,
  getClassMeetingDay,
  getLevelDisplayName,
  getMostRecentClassMeetingDate,
} from '@/lib/sunday-school-class'
import { ALL_CLASSES, useViewingClassId } from '@/lib/sunday-school-viewing'
import { buildFollowUps } from '@/lib/sunday-school-follow-up'
import type {
  SundaySchoolClassSummary,
  SundaySchoolDashboard,
  SundaySchoolHomeworkResponse,
  SundaySchoolVisitationsResponse,
  SundaySchoolWeeklyLesson,
  SundaySchoolWeeklyLessonsResponse,
} from '@/types/sunday-school'
import { TodayInChurch } from '@/components/liturgical/today-in-church'
import { useLiturgicalCalendarOverlay } from '@/components/liturgical/calendar-events'
import { CalendarSubscribeButton } from '@/components/liturgical/calendar-subscribe-button'
import { SundaySchoolMeetingCheckInShortcut } from '@/components/sunday-school-meeting-checkin-shortcut'
import { servantsMeetingGroups } from '@/lib/sunday-school-meeting-groups'

const UNBANDED = '__unbanded__'
const shortDate = (day: string) => formatUTC(day, { weekday: 'short', month: 'short', day: 'numeric' })

/** The class's next meeting on or after today, as a day key. */
function nextMeetingDay(cls: Pick<SundaySchoolClassSummary, 'level'>, today: string) {
  const [y, m, d] = today.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  while (date.getUTCDay() !== getClassMeetingDay(cls.level)) date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function lessonBadge(lesson: SundaySchoolWeeklyLesson | undefined) {
  if (!lesson) return <StatusBadge tone="neutral">Not scheduled</StatusBadge>
  if (lesson.status === 'READY') return <StatusBadge tone="ok">Ready</StatusBadge>
  if (lesson.status === 'NEEDS_LINKS') return <StatusBadge tone="warn">Needs links</StatusBadge>
  return <StatusBadge tone="warn">No teacher</StatusBadge>
}

function ChecklistRow({
  icon: Icon,
  title,
  detail,
  status,
  done,
  action,
}: {
  icon: LucideIcon
  title: string
  detail: React.ReactNode
  status?: React.ReactNode
  done?: boolean
  action?: React.ReactNode
}) {
  return (
    <li className="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center">
      <span className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={cn(
            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
            done ? 'bg-ok-tint text-ok' : 'bg-gold-tint text-gold'
          )}
        >
          {done ? <Check className="size-4" strokeWidth={2.25} aria-hidden /> : <Icon className="size-4" aria-hidden />}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-medium text-ink">{title}</span>
            {status}
          </span>
          <span className="min-w-0 text-[13px] break-words text-ink-3">{detail}</span>
        </span>
      </span>
      {action && <span className="flex shrink-0 pl-11 sm:pl-0 [&>*]:flex-1 sm:[&>*]:flex-none">{action}</span>}
    </li>
  )
}

export default function SundaySchoolDashboardPage() {
  const { status, session } = useSundaySchoolGuard()
  const { data, isLoading } = useSundaySchoolDashboard(undefined, undefined, 'children', { keepPreviousData: true })
  const dashboard = data as SundaySchoolDashboard | undefined
  const allClasses = useMemo(() => dashboard?.classes ?? [], [dashboard])
  const [viewing] = useViewingClassId(allClasses, { allowAll: true })
  const classes = useMemo(
    () => (viewing === ALL_CLASSES ? allClasses : allClasses.filter((c) => c.id === viewing)),
    [allClasses, viewing]
  )

  const today = localDayKey()
  const [month, setMonth] = useState(() => new Date())
  const [classView, setClassView] = useState<'all' | 'mine' | 'due'>('all')
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1)
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const horizon = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000)
  const lessonRange = useMemo(() => {
    const from = new Date(Math.min(monthStart.getTime(), Date.now()) - 7 * 24 * 60 * 60 * 1000)
    const to = new Date(Math.max(monthEnd.getTime(), horizon.getTime()) + 7 * 24 * 60 * 60 * 1000)
    return { from: utcDayKey(from), to: utcDayKey(to) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month.getFullYear(), month.getMonth()])
  const { data: lessonsData } = useSundaySchoolLessons(lessonRange)
  const { data: visitationsData } = useSundaySchoolVisitations()
  const scopeIds = useMemo(() => new Set(classes.map((c) => c.id)), [classes])
  const lessons = useMemo(
    () => ((lessonsData as SundaySchoolWeeklyLessonsResponse | undefined)?.lessons ?? []).filter((l) => scopeIds.has(l.classId)),
    [lessonsData, scopeIds]
  )

  // Feasts and fasts for the month on screen and the weeks coming up.
  const upcomingDays = useMemo(() => nextDays(28), [])
  const calendarDays = useMemo(() => [...new Set([...monthGridDays(month), ...upcomingDays])], [month, upcomingDays])
  const liturgical = useLiturgicalCalendarOverlay(calendarDays)

  const lessonEvents = useMemo<CalendarEvent[]>(() => {
    const byDay = new Map<string, SundaySchoolWeeklyLesson[]>()
    for (const l of lessons) {
      const day = utcDayKey(l.sundayDate)
      byDay.set(day, [...(byDay.get(day) ?? []), l])
    }
    return [...byDay.entries()].map(([day, list]) => ({
      id: `ss-${day}`,
      day,
      type: 'sunday-lesson' as const,
      title: list.length === 1 ? list[0].title || `${list[0].class.name}: no lesson yet` : `${list.length} class lessons`,
      meta:
        list.length === 1
          ? [list[0].class.name, list[0].owner ? `Teacher: ${list[0].owner.name}` : 'No teacher yet'].join(' · ')
          : `${list.filter((l) => l.status === 'READY').length} of ${list.length} ready`,
      href: '/dashboard/servants/lessons',
    }))
  }, [lessons])

  const servedClass = classes.length === 1 && classes[0].canServe ? classes[0] : undefined
  const homeworkClassId =
    servedClass && session?.user?.sundaySchool?.hasHomeworkAccess && getClassMeetingDay(servedClass.level) === 6 ? servedClass.id : undefined
  const { data: homeworkData } = useSundaySchoolHomework(homeworkClassId)

  const followUps = useMemo(() => {
    const visitClasses = (visitationsData as SundaySchoolVisitationsResponse | undefined)?.classes ?? []
    return buildFollowUps(visitClasses.filter((c) => scopeIds.has(c.id)), [], today).length
  }, [scopeIds, today, visitationsData])

  // An age-group coordinator runs several classes, so group the list by band.
  const grouped = useMemo(() => {
    const buckets = new Map<string, { name: string; classes: SundaySchoolClassSummary[] }>()
    for (const cls of classes) {
      const key = cls.ageGroup?.id ?? UNBANDED
      if (!buckets.has(key)) buckets.set(key, { name: cls.ageGroup?.name ?? 'Other classes', classes: [] })
      buckets.get(key)!.classes.push(cls)
    }
    for (const bucket of buckets.values()) bucket.classes.sort(compareClassesByLevelAndName)
    const order = [...(dashboard?.ageGroups ?? [])].sort(compareAgeGroupsByLevel).map((group) => group.id)
    return Array.from(buckets.entries()).sort((a, b) => {
      const ai = order.indexOf(a[0])
      const bi = order.indexOf(b[0])
      return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi)
    })
  }, [classes, dashboard?.ageGroups])

  if (status === 'loading' || isLoading) {
    return <PageLoading />
  }

  const standing = dashboard?.standing
  const served = classes.filter((c) => c.canServe)
  const coordinates = Boolean(standing?.isAdmin || standing?.coordinatesAnyAgeGroup || standing?.readOnly || classes.length > 1)
  const attendanceHref = served.length === 1 ? `/dashboard/servants/attendance?classId=${served[0].id}` : '/dashboard/servants/attendance'
  const due = classes.filter((c) => !c.attendanceTakenThisWeek)

  // "This week" is the class's own meeting: Saturday for Elementary, Sunday for the rest.
  const meetingFor = (cls: SundaySchoolClassSummary) => nextMeetingDay(cls, today)
  const lessonFor = (cls: SundaySchoolClassSummary) =>
    lessons.find((l) => l.classId === cls.id && utcDayKey(l.sundayDate) === meetingFor(cls))
  const lastMeeting = (cls: SundaySchoolClassSummary) => utcDayKey(getMostRecentClassMeetingDate(cls.level))
  const homeworkWeek = homeworkClassId
    ? (homeworkData as SundaySchoolHomeworkResponse | undefined)?.weeks.find(
        (w) => w.class.id === homeworkClassId && utcDayKey(w.assignedDate) === meetingFor(servedClass!)
      )
    : undefined

  const visibleBands = grouped
    .map(([key, band]) => [
      key,
      {
        ...band,
        classes: band.classes.filter((c) => (classView === 'mine' ? c.canServe : classView === 'due' ? !c.attendanceTakenThisWeek : true)),
      },
    ] as const)
    .filter(([, band]) => band.classes.length > 0)

  const viewingClass = viewing !== ALL_CLASSES ? classes[0] : undefined
  const meetingDays = new Set(classes.map((c) => getClassMeetingDay(c.level)))
  const nextMeeting = classes.length ? classes.map(meetingFor).sort()[0] : null

  return (
    <div className="content-reveal flex min-w-0 flex-col gap-5">
      <PageHeader
        title={viewingClass ? viewingClass.name : 'Sunday School'}
        meta={[
          viewingClass ? viewingClass.classroom || viewingClass.ageGroup?.name : allClasses.length > 1 ? `${classes.length} classes` : null,
          nextMeeting
            ? `Next ${meetingDays.size === 1 ? 'meeting' : 'class'} ${formatUTC(nextMeeting, { weekday: 'long', month: 'long', day: 'numeric' })}`
            : null,
        ]}
        actions={
          <>
            {servantsMeetingGroups(dashboard).map((group) => (
              <SundaySchoolMeetingCheckInShortcut key={group.id} ageGroupId={group.id} />
            ))}
            {served.length > 0 && !servedClass && (
              <Button asChild>
                <Link href={attendanceHref}>
                  <ClipboardCheck />
                  Take attendance
                </Link>
              </Button>
            )}
          </>
        }
      />

      {allClasses.length === 0 ? (
        <Panel>
          <EmptyState
            message={
              standing?.isAdmin
                ? 'No classes yet. Create one in Classes & servants to start building a roster and taking attendance.'
                : 'You have not been assigned to a Sunday School class yet. Ask your coordinator or a super admin to add you.'
            }
          />
        </Panel>
      ) : (
        <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-5">
            {servedClass && (
              <Panel
                title="This week"
                description={`${servedClass.name} · ${formatUTC(meetingFor(servedClass), { weekday: 'long', month: 'long', day: 'numeric' })}`}
              >
                <ul className="divide-y divide-line">
                  <ChecklistRow
                    icon={BookOpen}
                    title="Lesson"
                    done={lessonFor(servedClass)?.status === 'READY'}
                    status={lessonBadge(lessonFor(servedClass))}
                    detail={
                      lessonFor(servedClass)
                        ? `${lessonFor(servedClass)!.title || 'No title yet'} · ${lessonFor(servedClass)!.owner ? `Teacher: ${lessonFor(servedClass)!.owner!.name}` : 'No teacher yet'}`
                        : 'No lesson is scheduled for this meeting.'
                    }
                    action={
                      <Button asChild variant="outline" size="sm">
                        <Link href="/dashboard/servants/lessons">Open lesson</Link>
                      </Button>
                    }
                  />
                  <ChecklistRow
                    icon={ClipboardCheck}
                    title="Attendance"
                    done={servedClass.attendanceTakenThisWeek}
                    status={servedClass.attendanceTakenThisWeek ? <StatusBadge tone="ok">Taken</StatusBadge> : <StatusBadge tone="warn">Due</StatusBadge>}
                    detail={
                      servedClass.attendanceTakenThisWeek
                        ? `Saved for ${shortDate(lastMeeting(servedClass))}`
                        : `${servedClass.childCount} children · for ${shortDate(lastMeeting(servedClass))}`
                    }
                    action={
                      <Button asChild variant={servedClass.attendanceTakenThisWeek ? 'outline' : 'default'} size="sm">
                        <Link href={`/dashboard/servants/attendance?classId=${servedClass.id}`}>
                          {servedClass.attendanceTakenThisWeek ? 'Review' : 'Take attendance'}
                        </Link>
                      </Button>
                    }
                  />
                  {homeworkClassId && (
                    <ChecklistRow
                      icon={NotebookPen}
                      title="Homework"
                      done={Boolean(homeworkWeek?.homework)}
                      status={homeworkWeek?.homework ? <StatusBadge tone="ok">Published</StatusBadge> : <StatusBadge tone="neutral">Not yet</StatusBadge>}
                      detail={homeworkWeek?.homework ? homeworkWeek.homework.title : 'Nothing published for this week'}
                      action={
                        <Button asChild variant="outline" size="sm">
                          <Link href="/dashboard/servants/homework">Homework</Link>
                        </Button>
                      }
                    />
                  )}
                  <ChecklistRow
                    icon={HeartHandshake}
                    title="Follow up"
                    done={followUps === 0}
                    status={followUps > 0 ? <StatusBadge tone="bad">{followUps} {followUps === 1 ? 'child' : 'children'}</StatusBadge> : <StatusBadge tone="ok">All clear</StatusBadge>}
                    detail={followUps > 0 ? 'Absent several weeks or waiting for a visit' : 'Nobody needs a call this week'}
                    action={
                      <Button asChild variant="outline" size="sm">
                        <Link href="/dashboard/servants/care">Open Care</Link>
                      </Button>
                    }
                  />
                </ul>
              </Panel>
            )}

            {coordinates && (
              <Panel
                title="Needs you"
                description={due.length > 0 ? 'Classes still missing attendance for their last meeting' : undefined}
              >
                {due.length === 0 && followUps === 0 ? (
                  <EmptyState message="Every class has attendance, and nobody is waiting for follow-up." />
                ) : (
                  <ul className="divide-y divide-line">
                    {due.slice(0, 8).map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[13.5px] font-medium text-ink">{c.name}</span>
                          <span className="truncate text-xs text-ink-3">
                            Attendance due · {shortDate(lastMeeting(c))}
                            {c.servants.length === 0 ? ' · no servants assigned' : ''}
                          </span>
                        </span>
                        {c.canServe ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/dashboard/servants/attendance?classId=${c.id}`}>Take</Link>
                          </Button>
                        ) : (
                          <StatusBadge tone="warn">Due</StatusBadge>
                        )}
                      </li>
                    ))}
                    {due.length > 8 && <li className="px-4 py-2 text-xs text-ink-3">+{due.length - 8} more classes</li>}
                    {followUps > 0 && (
                      <li className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <span className="flex min-w-0 flex-col">
                          <span className="text-[13.5px] font-medium text-ink">
                            {followUps} {followUps === 1 ? 'child needs' : 'children need'} follow-up
                          </span>
                          <span className="text-xs text-ink-3">Absent several weeks or waiting for a visit</span>
                        </span>
                        <Button asChild size="sm" variant="outline">
                          <Link href="/dashboard/servants/care">Care</Link>
                        </Button>
                      </li>
                    )}
                  </ul>
                )}
              </Panel>
            )}

            {coordinates && (
              <Panel
                title="Classes"
                description={`${classes.length} classes${grouped.length > 1 ? ' · grouped by age group' : ''}`}
                actions={
                  <Segmented
                    label="Classes"
                    value={classView}
                    onChange={setClassView}
                    options={[
                      { value: 'all', label: 'All' },
                      ...(served.length > 0 && served.length < classes.length ? [{ value: 'mine' as const, label: 'Mine' }] : []),
                      { value: 'due', label: 'Due', count: due.length },
                    ]}
                  />
                }
              >
                {visibleBands.length === 0 ? (
                  <EmptyState message={classView === 'due' ? 'Every class has attendance this week.' : 'No classes here.'} />
                ) : (
                  <ul className="divide-y divide-line">
                    {visibleBands.map(([key, band]) => (
                      <li key={key}>
                        {grouped.length > 1 && (
                          <p className="border-b border-line bg-hover/40 px-4 py-1.5 text-xs font-semibold text-ink-2">{band.name}</p>
                        )}
                        <ul className="divide-y divide-line">
                          {band.classes.map((cls) => (
                            <li key={cls.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_7rem_6rem_auto]">
                              <span className="flex min-w-0 flex-col">
                                <span className="flex min-w-0 items-center gap-2">
                                  <Link href={`/dashboard/servants/classes/${cls.id}`} className="truncate text-[13.5px] font-medium text-ink no-underline hover:underline">
                                    {cls.name}
                                  </Link>
                                  {cls.canCoordinate && !standing?.isAdmin && <StatusBadge tone="gold" dot={false}>Coordinator</StatusBadge>}
                                </span>
                                <span className="truncate text-xs text-ink-3">
                                  {getLevelDisplayName(cls.level)} · {cls.childCount} children ·{' '}
                                  {cls.servants.length === 0 ? 'no servants' : cls.servants.map((sv) => sv.name.split(' ')[0]).join(', ')}
                                </span>
                              </span>
                              <span className="hidden md:block">
                                {cls.sessionCount > 0 ? <Metric value={cls.attendancePercentage} width={48} /> : <span className="text-xs text-ink-3">No meetings yet</span>}
                              </span>
                              <span className="hidden md:block">
                                {cls.attendanceTakenThisWeek ? <StatusBadge tone="ok">Taken</StatusBadge> : <StatusBadge tone="warn">Due</StatusBadge>}
                              </span>
                              <span className="flex justify-end gap-1">
                                <Button asChild variant="ghost" size="sm">
                                  <Link href={`/dashboard/servants/roster?classId=${cls.id}`} aria-label={`Children in ${cls.name}`}>Children</Link>
                                </Button>
                                {cls.canServe && (
                                  <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                                    <Link href={`/dashboard/servants/attendance?classId=${cls.id}`}>Attendance</Link>
                                  </Button>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}

            {coordinates && (
              <Panel
                title="Calendar"
                actions={
                  <>
                    <EventLegend types={['sunday-lesson', 'feast']} fastDays />
                    <CalendarSubscribeButton variant="ghost" />
                  </>
                }
                className="hidden md:block"
              >
                <MonthCalendar month={month} events={[...lessonEvents, ...liturgical.events]} fastDays={liturgical.fastDays} onMonthChange={setMonth} maxPerDay={2} />
              </Panel>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <TodayInChurch />
            <Panel
              title="Coming up"
              actions={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/dashboard/servants/lessons">
                    <CalendarCheck />
                    Lessons
                  </Link>
                </Button>
              }
            >
              <Agenda
                days={upcomingDays}
                events={[...lessonEvents, ...liturgical.events].filter((e) => e.day >= today)}
                emptyToday="No class today"
              />
            </Panel>
          </div>
        </div>
      )}
    </div>
  )
}
