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

export default function StudentClassLessonsPage() {
  const { session, status } = useAdminGuard(isStudent)
  const { data, isLoading } = useSundaySchoolLessons()
  const { data: homeworkData } = useSundaySchoolHomework()
  const lessons = (data as SundaySchoolWeeklyLessonsResponse | undefined)?.lessons ?? []

  if (status === 'loading' || !session || isLoading) return <PageLoading />

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader title="Class lessons" meta={['Upcoming Sunday School slides and resources for your class']} />

      {lessons.length === 0 ? (
        <Panel>
          <EmptyState
            title="No class lessons yet"
            message="Your account may not be linked to a Sunday School child record, or your class has no upcoming lessons. Ask your class coordinator to check the link."
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

      <SundaySchoolHomeworkCards data={homeworkData as SundaySchoolHomeworkResponse | undefined} />
    </div>
  )
}
