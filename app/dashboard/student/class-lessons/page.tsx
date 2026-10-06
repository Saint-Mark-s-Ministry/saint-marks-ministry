'use client'

import { ExternalLink, Loader2 } from 'lucide-react'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { isStudent } from '@/lib/roles'
import { useSundaySchoolHomework, useSundaySchoolLessons } from '@/lib/swr'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { SundaySchoolWeeklyLessonsResponse } from '@/types/sunday-school'
import type { SundaySchoolHomeworkResponse } from '@/types/sunday-school'
import { SundaySchoolHomeworkCards } from '@/components/sunday-school-homework-cards'

export default function StudentClassLessonsPage() {
  const { session, status } = useAdminGuard(isStudent)
  const { data, isLoading } = useSundaySchoolLessons()
  const { data: homeworkData } = useSundaySchoolHomework()
  const lessons = (data as SundaySchoolWeeklyLessonsResponse | undefined)?.lessons ?? []

  if (status === 'loading' || !session || isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-maroon-600" /></div>
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Class Lessons</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">Upcoming Sunday School slides and resources for your class.</p>
        </div>

        {lessons.length === 0 ? (
          <Card>
            <CardHeader><CardTitle>No class lessons yet</CardTitle></CardHeader>
            <CardContent className="text-sm text-gray-600 dark:text-gray-400">
              Your student account may not be linked to a Sunday School child record, or your class has no upcoming lessons. Ask your class coordinator to check the account link.
            </CardContent>
          </Card>
        ) : lessons.map(lesson => (
          <Card key={lesson.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>{lesson.title || 'Upcoming lesson'}</CardTitle>
                  <CardDescription>
                    {lesson.class.name} · {new Date(lesson.sundayDate).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' })}
                  </CardDescription>
                </div>
                {lesson.status === 'READY' && <Badge className="bg-green-600">Ready</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              {lesson.resources.length === 0 ? (
                <p className="text-sm text-gray-500">Links have not been added yet.</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {lesson.resources.map(resource => (
                    <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-maroon-700 hover:underline dark:text-maroon-300">
                      <ExternalLink className="h-4 w-4" /> {resource.title}
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        <SundaySchoolHomeworkCards data={homeworkData as SundaySchoolHomeworkResponse | undefined} />
      </div>
    </div>
  )
}
