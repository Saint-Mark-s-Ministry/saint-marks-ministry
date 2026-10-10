import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateUTC } from '@/lib/utils'
import type { SundaySchoolHomeworkDisplayStatus, SundaySchoolHomeworkResponse } from '@/types/sunday-school'

function HomeworkStatus({ status }: { status: SundaySchoolHomeworkDisplayStatus }) {
  if (status === 'COMPLETED') return <Badge className="bg-emerald-600 hover:bg-emerald-600">Completed</Badge>
  if (status === 'NOT_COMPLETED') return <Badge className="bg-amber-600 hover:bg-amber-600">Not completed</Badge>
  return <Badge variant="secondary">Not recorded</Badge>
}

export function SundaySchoolHomeworkCards({ data }: { data?: SundaySchoolHomeworkResponse }) {
  if (!data?.eligible) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Homework</CardTitle>
        <CardDescription>Elementary homework assigned by your child&rsquo;s class servants</CardDescription>
      </CardHeader>
      <CardContent>
        {data.weeks.length === 0 ? (
          <p className="text-sm text-gray-500">No homework has been assigned yet.</p>
        ) : (
          <div className="divide-y dark:divide-gray-800">
            {data.weeks.map(week => {
              const homework = week.homework
              if (!homework) return null
              const children = data.roster.filter(child => child.classId === week.class.id || data.roster.length === 1)
              return (
                <div key={homework.id} className="space-y-3 py-4 first:pt-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-gray-500">
                        {week.class.name} · assigned {formatDateUTC(week.assignedDate)} · due {formatDateUTC(week.dueDate)}
                      </p>
                      <h2 className="text-xl font-medium">{homework.title}</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {children.map(child => {
                        const status = homework.completions.find(completion => completion.childId === child.id)?.status ?? 'NOT_RECORDED'
                        return (
                          <span key={child.id} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                            {data.roster.length > 1 && <span>{child.firstName}</span>}
                            <HomeworkStatus status={status} />
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  {homework.instructions && <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">{homework.instructions}</p>}
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
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
