'use client'

import { useEffect, useState } from 'react'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { PageLoading } from '@/components/ui/page-loading'
import { FilterSelect } from '@/components/ui/filter-select'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ds/page-header'
import { KpiStrip } from '@/components/ds/kpi-strip'
import { Panel } from '@/components/ds/panel'
import { Segmented } from '@/components/ds/segmented'
import { SearchField } from '@/components/ds/search-field'
import { StatusBadge } from '@/components/ds/status-badge'
import { DetailPanel, SplitView } from '@/components/ds/detail-panel'
import { KeyValueList } from '@/components/ds/kv-list'
import { ResourceLink } from '@/components/ds/resource-link'
import { formatDateUTC, formatUTC } from '@/lib/utils'
import { Paperclip } from 'lucide-react'

interface LessonResource {
  id: string
  title: string
  url: string
  type: string | null
}

interface Lesson {
  id: string
  /** On or after the day the student went async (no roll call). */
  asyncPeriod?: boolean
  title: string
  subtitle: string | null
  speaker: string | null
  description: string | null
  scheduledDate: string
  lessonNumber: number
  status: string
  examSection: {
    id: string
    name: string
    displayName: string
  }
  academicYear: {
    id: string
    name: string
    isActive: boolean
  }
  resources: LessonResource[]
  attendance: {
    id: string
    status: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED'
    arrivedAt: string | null
    notes: string | null
    conductRemoval: boolean
    notEnrolledYet?: boolean
    expectedAbsenceNA?: boolean
  } | null
}

export default function StudentLessonsPage() {
  const { session, status } = useAdminGuard((role) => role === 'STUDENT')
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterSection, setFilterSection] = useState<string>('all')
  const [filterAttendance, setFilterAttendance] = useState<string>('all')
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null)
  const [view, setView] = useState<'upcoming' | 'completed' | 'all'>('all')

  useEffect(() => {
    const fetchLessons = async () => {
      if (!session?.user?.id) return

      try {
        const res = await fetch(`/api/students/${session.user.id}/lessons`)
        if (res.ok) {
          const data = await res.json()
          setLessons(data)
        }
      } catch (error) {
        console.error('Failed to fetch lessons:', error)
      } finally {
        setLoading(false)
      }
    }

    if (session?.user?.id) {
      fetchLessons()
    }
  }, [session?.user?.id])

  // Get unique sections for filter
  const sections = Array.from(new Set(lessons.map(l => l.examSection.displayName)))

  // Filter lessons
  const filteredLessons = lessons.filter(lesson => {
    if (searchTerm && !lesson.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !lesson.description?.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false
    }

    if (filterSection !== 'all' && lesson.examSection.displayName !== filterSection) {
      return false
    }

    if (filterAttendance !== 'all') {
      if (filterAttendance === 'present' && lesson.attendance?.status !== 'PRESENT') return false
      if (filterAttendance === 'absent' && (!lesson.attendance || lesson.attendance.status === 'ABSENT')) return false
      if (filterAttendance === 'late' && lesson.attendance?.status !== 'LATE') return false
    }

    return true
  })

  const now = new Date()
  const isUpcoming = (l: Lesson) => l.status === 'SCHEDULED' && new Date(l.scheduledDate) >= new Date(now.toDateString())
  const viewLessons = filteredLessons.filter((l) => (view === 'all' ? true : view === 'upcoming' ? isUpcoming(l) : !isUpcoming(l)))
  const ordered = view === 'upcoming' ? [...viewLessons].sort((a, b) => +new Date(a.scheduledDate) - +new Date(b.scheduledDate)) : [...viewLessons].sort((a, b) => +new Date(b.scheduledDate) - +new Date(a.scheduledDate))
  const thisYear = lessons.filter((l) => l.academicYear.isActive)
  const counted = thisYear.filter((l) => l.attendance && !l.attendance.notEnrolledYet && !l.attendance.expectedAbsenceNA)
  const attended = counted.filter((l) => l.attendance?.status === 'PRESENT' || l.attendance?.status === 'LATE').length
  const next = [...lessons].filter(isUpcoming).sort((a, b) => +new Date(a.scheduledDate) - +new Date(b.scheduledDate))[0]
  const selected = lessons.find((l) => l.id === expandedLesson) ?? null

  const attendanceBadge = (lesson: Lesson) => {
    const a = lesson.attendance
    if (lesson.asyncPeriod && !a) {
      return isUpcoming(lesson)
        ? <StatusBadge tone="neutral" dot={false}>Async</StatusBadge>
        : <StatusBadge tone="neutral" dot={false}>Async · rotation</StatusBadge>
    }
    if (lesson.status === 'SCHEDULED' && !a) return <StatusBadge tone="info">Upcoming</StatusBadge>
    if (!a) return <span className="text-ink-3">—</span>
    if (a.notEnrolledYet) return <StatusBadge tone="neutral" dot={false}>Before you joined</StatusBadge>
    if (a.expectedAbsenceNA) return <StatusBadge tone="neutral" dot={false}>Not counted</StatusBadge>
    const meta = { PRESENT: ['ok', 'Present'], LATE: ['warn', 'Late'], ABSENT: ['bad', 'Absent'], EXCUSED: ['info', 'Excused'] } as const
    return <StatusBadge tone={meta[a.status][0]}>{meta[a.status][1]}</StatusBadge>
  }

  if (loading || status === 'loading') {
    return <PageLoading />
  }

  return (
    <div className="content-reveal flex min-w-0 flex-col gap-5">
      <PageHeader title="My lessons" meta={['Your lessons, resources and attendance']} />

      <KpiStrip
        items={[
          { label: 'Total lessons', value: thisYear.length, hint: `${thisYear.filter((l) => l.status === 'COMPLETED').length} completed` },
          { label: 'Attended', value: <>{attended}<span className="font-normal text-ink-3"> / {counted.length}</span></>, hint: 'this year' },
          {
            label: 'Next',
            value: <span className="text-[22px]">{next ? formatUTC(next.scheduledDate, { month: 'short', day: 'numeric' }) : '—'}</span>,
            hint: next ? `Lesson ${next.lessonNumber} · ${next.title}` : 'Nothing scheduled',
          },
        ]}
      />

      <SplitView>
        <Panel
          className="flex-1"
          toolbar={
            <>
              <Segmented
                label="Lessons"
                value={view}
                onChange={setView}
                options={[
                  { value: 'upcoming', label: 'Upcoming' },
                  { value: 'completed', label: 'Past' },
                  { value: 'all', label: 'All' },
                ]}
              />
              <div className="flex w-full flex-wrap items-center gap-2 md:ml-auto md:w-auto">
                <FilterSelect
                  aria-label="Section"
                  value={filterSection}
                  onChange={setFilterSection}
                  options={[{ value: 'all', label: 'All sections' }, ...sections.map((x) => ({ value: x, label: x }))]}
                />
                <FilterSelect
                  aria-label="Attendance"
                  value={filterAttendance}
                  onChange={setFilterAttendance}
                  options={[
                    { value: 'all', label: 'All attendance' },
                    { value: 'present', label: 'Present' },
                    { value: 'late', label: 'Late' },
                    { value: 'absent', label: 'Absent or missing' },
                  ]}
                />
                <SearchField value={searchTerm} onChange={setSearchTerm} placeholder="Search lessons" className="flex-1 md:flex-none" />
              </div>
            </>
          }
          footer={<span className="tabular">{ordered.length} lessons</span>}
        >
          {ordered.length === 0 ? (
            <EmptyState message={view === 'upcoming' ? 'No upcoming lessons.' : 'No lessons match.'} />
          ) : (
            <ul className="divide-y divide-line">
              {ordered.map((lesson) => (
                <li key={lesson.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedLesson(lesson.id)}
                    className={`grid w-full cursor-pointer grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left md:grid-cols-[40px_110px_minmax(0,1fr)_130px_110px] ${expandedLesson === lesson.id ? 'bg-accent-tint' : 'hover:bg-hover/60'}`}
                  >
                    <span className="tabular text-[13px] font-medium text-ink-3">{lesson.lessonNumber}</span>
                    <span className="hidden text-[13px] text-ink-2 md:block">{formatUTC(lesson.scheduledDate, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[13.5px] font-medium text-ink">{lesson.title}</span>
                      <span className="truncate text-xs text-ink-3">
                        <span className="md:hidden">{formatUTC(lesson.scheduledDate, { month: 'short', day: 'numeric' })} · </span>
                        {lesson.speaker || lesson.examSection.displayName}
                      </span>
                    </span>
                    <span>{attendanceBadge(lesson)}</span>
                    <span className="hidden items-center gap-1 text-xs text-ink-3 md:flex">
                      <Paperclip className="size-3.5" aria-hidden />
                      {lesson.resources.length || '—'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {selected && (
          <DetailPanel open onClose={() => setExpandedLesson(null)} title={`Lesson ${selected.lessonNumber} · ${selected.title}`}>
            <div className="flex flex-col gap-4">
              <KeyValueList
                items={[
                  { label: 'Date', value: formatDateUTC(selected.scheduledDate) },
                  { label: 'Section', value: selected.examSection.displayName },
                  ...(selected.speaker ? [{ label: 'Speaker', value: selected.speaker }] : []),
                  { label: 'Your attendance', value: attendanceBadge(selected) },
                  ...(selected.attendance?.arrivedAt ? [{ label: 'Arrived', value: selected.attendance.arrivedAt }] : []),
                  ...(selected.attendance?.conductRemoval ? [{ label: 'Note', value: <span className="text-bad">Removed from this lesson</span> }] : []),
                ]}
              />
              {(selected.subtitle || selected.description) && (
                <section className="flex flex-col gap-1">
                  <h3 className="text-xs font-medium tracking-[0.06em] text-ink-3 uppercase">Description</h3>
                  {selected.subtitle && <p className="text-[13px] font-medium text-ink">{selected.subtitle}</p>}
                  {selected.description && <p className="text-[13px] whitespace-pre-wrap text-ink-2">{selected.description}</p>}
                </section>
              )}
              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-medium tracking-[0.06em] text-ink-3 uppercase">Resources</h3>
                {selected.resources.length === 0 ? (
                  <p className="text-[13px] text-ink-3">No resources for this lesson yet.</p>
                ) : (
                  selected.resources.map((r) => <ResourceLink key={r.id} title={r.title} url={r.url} type={r.type} />)
                )}
              </section>
            </div>
          </DetailPanel>
        )}
      </SplitView>
    </div>
  )
}
