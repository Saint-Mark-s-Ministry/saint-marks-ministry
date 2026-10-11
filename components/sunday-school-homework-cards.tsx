import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel } from '@/components/ds/panel'
import { StatusBadge } from '@/components/ds/status-badge'
import { formatDateUTC } from '@/lib/utils'
import type { SundaySchoolHomeworkDisplayStatus, SundaySchoolHomeworkResponse } from '@/types/sunday-school'

function HomeworkStatus({ status }: { status: SundaySchoolHomeworkDisplayStatus }) {
  if (status === 'COMPLETED') return <StatusBadge tone="ok">Completed</StatusBadge>
  if (status === 'NOT_COMPLETED') return <StatusBadge tone="bad">Not completed</StatusBadge>
  return <StatusBadge tone="neutral">Not recorded</StatusBadge>
}

export function SundaySchoolHomeworkCards({ data }: { data?: SundaySchoolHomeworkResponse }) {
  if (!data?.eligible) return null

  return (
    <Panel title="Homework" description="Elementary homework assigned by your child’s class servants">
      {data.weeks.length === 0 ? (
        <EmptyState message="No homework has been assigned yet." />
      ) : (
        <ul className="divide-y divide-line">
          {data.weeks.map(week => {
            const homework = week.homework
            if (!homework) return null
            const children = data.roster.filter(child => child.classId === week.class.id || data.roster.length === 1)
            return (
              <li key={homework.id} className="space-y-3 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-ink-3">
                      {week.class.name} · assigned {formatDateUTC(week.assignedDate)} · due {formatDateUTC(week.dueDate)}
                    </p>
                    <h2 className="font-display text-xl font-medium text-ink">{homework.title}</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {children.map(child => {
                      const status = homework.completions.find(completion => completion.childId === child.id)?.status ?? 'NOT_RECORDED'
                      return (
                        <span key={child.id} className="flex items-center gap-1.5 text-xs text-ink-2">
                          {data.roster.length > 1 && <span>{child.firstName}</span>}
                          <HomeworkStatus status={status} />
                        </span>
                      )
                    })}
                  </div>
                </div>
                {homework.instructions && <p className="whitespace-pre-wrap text-sm text-ink-2">{homework.instructions}</p>}
                {homework.resources.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {homework.resources.map(resource => (
                      <Button key={resource.id} asChild variant="outline" size="sm">
                        <a href={resource.url} target="_blank" rel="noreferrer">
                          <ExternalLink /> {resource.title}
                        </a>
                      </Button>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
