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
    <div className="content-reveal flex min-w-0 flex-col print:bg-white print:p-0">
      <div className="flex w-full flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <Button variant="ghost" onClick={() => router.push('/dashboard/student')}>
            <ChevronLeft />
            Back
          </Button>
          <Button onClick={() => window.print()}>
            <Printer />
            Print / Save as PDF
          </Button>
        </div>

        {/* The slip is paper in both themes: it gets printed and signed. */}
        <div className="mx-auto w-full max-w-[816px] bg-white p-6 text-[#1B1817] shadow-[0_8px_30px_rgba(0,0,0,0.18)] md:p-14 print:max-w-none print:p-0 print:shadow-none">
          <div className="mb-6 flex items-center gap-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-black p-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- static logo, also used when printing */}
              <img src="/sp-logo.png" alt="Servants Prep" className="size-full object-contain" />
            </span>
            <div>
              <p className="text-xs tracking-[0.08em] text-[#57504B] uppercase">Servants Preparation Program</p>
              <h1 className="font-display text-[28px] leading-tight font-medium">Async Student Attendance Slip</h1>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-x-10 gap-y-2 text-[13.5px]">
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
                <th className="w-10 border border-black bg-[#F1EEEA] p-2 text-left text-xs">#</th>
                <th className="w-28 border border-black bg-[#F1EEEA] p-2 text-left text-xs">Lesson date</th>
                <th className="border border-black bg-[#F1EEEA] p-2 text-left text-xs">Lesson</th>
                <th className="w-28 border border-black bg-[#F1EEEA] p-2 text-left text-xs">Completed on</th>
                <th className="w-48 border border-black bg-[#F1EEEA] p-2 text-left text-xs">Verified by (name &amp; signature)</th>
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
