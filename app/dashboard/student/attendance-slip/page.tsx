'use client'

import { useEffect } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { isStudent } from '@/lib/roles'
import { formatDateUTC } from '@/lib/utils'
import { fetcher, defaultSWRConfig, staticDataConfig } from '@/lib/swr'
import type { AcademicYear } from '@/lib/types'
import { PageLoading } from '@/components/ui/page-loading'
import { Button } from '@/components/ui/button'
import { ChevronLeft, Printer } from 'lucide-react'

interface Lesson {
  id: string
  title: string
  lessonNumber: number
  scheduledDate: string
}

// Printable attendance slip for async students. They get each lesson signed,
// then a Servants Prep servant uploads a photo of it to record attendance.
export default function AttendanceSlipPage() {
  const { session, status } = useAdminGuard(isStudent)
  const router = useRouter()
  const { data: years } = useSWR<AcademicYear[]>(session?.user ? '/api/academic-years' : null, fetcher, staticDataConfig)
  const activeYear = years?.find(y => y.isActive)
  const { data: lessons = [], isLoading: lessonsLoading } = useSWR<Lesson[]>(
    activeYear ? `/api/lessons?forAttendance=true&academicYearId=${activeYear.id}` : null,
    fetcher,
    defaultSWRConfig
  )

  useEffect(() => {
    if (status === 'authenticated' && !session?.user?.isAsyncStudent) {
      router.push('/dashboard/student')
    }
  }, [status, session, router])

  if (status === 'loading' || !years || lessonsLoading) return <PageLoading />

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 md:p-8 print:p-0 print:bg-white">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/student')} className="gap-1">
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
          <Button onClick={() => window.print()} className="gap-2">
            <Printer className="h-4 w-4" />
            Print / Save as PDF
          </Button>
        </div>

        <div className="rounded-lg border bg-white p-6 text-black dark:bg-gray-900 dark:text-white md:p-10 print:rounded-none print:border-0 print:bg-white print:p-0 print:text-black">
          <div className="border-b-2 border-black pb-3 mb-4">
            <h1 className="text-2xl font-bold">Servants Preparation Program</h1>
            <p className="text-lg">Async Student Attendance Slip</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm mb-4">
            <div><span className="font-semibold">Student:</span> {session?.user?.name}</div>
            <div><span className="font-semibold">Academic year:</span> {activeYear?.name ?? '__________'}</div>
          </div>

          <p className="text-sm mb-4">
            For each lesson you complete, write the date and have your verifier sign.
            Hand this slip to a Servants Prep servant — once they upload a photo of it,
            the signed lessons count toward your attendance.
          </p>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="border border-black p-2 text-left w-10">#</th>
                <th className="border border-black p-2 text-left w-28">Lesson date</th>
                <th className="border border-black p-2 text-left">Lesson</th>
                <th className="border border-black p-2 text-left w-28">Completed on</th>
                <th className="border border-black p-2 text-left w-48">Verified by (name &amp; signature)</th>
              </tr>
            </thead>
            <tbody>
              {(lessons.length > 0 ? lessons : Array.from({ length: 15 }, () => null)).map((lesson, i) => (
                <tr key={lesson?.id ?? i} className="break-inside-avoid">
                  <td className="border border-black p-2 h-10">{lesson?.lessonNumber ?? ''}</td>
                  <td className="border border-black p-2">
                    {lesson ? formatDateUTC(lesson.scheduledDate, { weekday: undefined, month: 'short', day: 'numeric', year: undefined }) : ''}
                  </td>
                  <td className="border border-black p-2">{lesson?.title ?? ''}</td>
                  <td className="border border-black p-2" />
                  <td className="border border-black p-2" />
                </tr>
              ))}
            </tbody>
          </table>

          <div className="grid grid-cols-2 gap-8 mt-8 text-sm">
            <div className="border-t border-black pt-1">Student signature</div>
            <div className="border-t border-black pt-1">Date</div>
          </div>
        </div>
      </div>
    </div>
  )
}
