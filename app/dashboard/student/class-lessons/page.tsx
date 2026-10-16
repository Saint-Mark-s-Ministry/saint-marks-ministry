'use client'

import { useAdminGuard } from '@/hooks/useAdminGuard'
import { isStudent } from '@/lib/roles'
import { useSundaySchoolHomework, useSundaySchoolLessons } from '@/lib/swr'
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { StatusBadge } from '@/components/ds/status-badge'
import { ResourceLink } from '@/components/ds/resource-link'
import type { SundaySchoolWeeklyLessonsResponse } from '@/types/sunday-school'
import type { SundaySchoolHomeworkResponse } from '@/types/sunday-school'
import { SundaySchoolHomeworkCards } from '@/components/sunday-school-homework-cards'
import { Button } from '@/components/ui/button'

export default function StudentClassLessonsPage() {
  const { session, status } = useAdminGuard(isStudent)
  const { data, isLoading, error, mutate } = useSundaySchoolLessons(undefined, { refreshInterval: 15000, revalidateOnFocus: true })
  const { data: homeworkData } = useSundaySchoolHomework()
  const lessons = (data as SundaySchoolWeeklyLessonsResponse | undefined)?.lessons ?? []
  const classes = (data as SundaySchoolWeeklyLessonsResponse | undefined)?.classes ?? []
  const isAsync = Boolean(session?.user?.isAsyncStudent)
  const rotationsComplete = isAsync && data?.completedRotations === 10

  if (status === 'loading' || !session || isLoading) return <PageLoading />

  return (
    <div className="content-reveal flex min-w-0 flex-col gap-5">
      <PageHeader title="Class lessons" meta={['Upcoming Sunday School slides and resources for your class']} />

      {!error && classes.length > 0 && (
        <Panel title={isAsync ? 'Your serving class' : 'Your class'}>
          <ul className="flex flex-wrap gap-2 px-4 py-3">
            {classes.map(cls => (
              <li key={cls.id} className="text-sm font-medium text-ink">
                <span>{cls.name}</span>
                <span className="block break-words text-sm font-normal text-ink-2">
                  Classroom: {cls.classroom || 'Not set — ask your class coordinator for the location.'}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {error ? (
        <Panel>
          <EmptyState title="Could not load class lessons" message="Please try again." />
          <div className="px-4 pb-4"><Button variant="outline" onClick={() => void mutate()}>Try again</Button></div>
        </Panel>
      ) : lessons.length === 0 ? (
        <Panel>
          <EmptyState
            title={rotationsComplete ? 'All ten rotations complete' : isAsync && classes.length === 0 ? 'No serving class assigned' : 'No upcoming class lessons'}
            message={rotationsComplete ? 'You have completed a signed four-week rotation at every grade from Pre-K through eighth grade.' : classes.length > 0
              ? 'Your assigned class has no upcoming lessons yet.'
              : isAsync
                ? 'Ask a Servants Prep servant to link your active serving assignment to a Sunday School class.'
                : 'Your account may not be linked to a Sunday School child record. Ask your class coordinator to check the link.'}
          />
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {lessons.map((lesson) => (
            <Panel key={lesson.id} bodyClassName="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] text-ink-3">
                  {new Date(lesson.sundayDate).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })} · {lesson.class.name}
                </span>
                {lesson.status === 'READY' ? <StatusBadge tone="ok">Ready</StatusBadge> : <StatusBadge tone="warn">Needs links</StatusBadge>}
              </div>
              <h2 className="font-display text-[22px] leading-tight font-medium text-ink">{lesson.title || 'Upcoming lesson'}</h2>
              {lesson.resources.length === 0 ? (
                <p className="text-[13px] text-ink-3">Links have not been added yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {lesson.resources.map((resource) => (
                    <ResourceLink key={resource.id} title={resource.title} url={resource.url} compact />
                  ))}
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}

      {!isAsync && <SundaySchoolHomeworkCards data={homeworkData as SundaySchoolHomeworkResponse | undefined} />}
    </div>
  )
}
