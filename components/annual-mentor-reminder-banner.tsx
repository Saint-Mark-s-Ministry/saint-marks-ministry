'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { useStudentApplicationState } from '@/lib/swr'

const APPLICATION_PATH = '/dashboard/student/application'

export function AnnualMentorReminderBanner() {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const isStudent = status === 'authenticated' && session?.user?.role === 'STUDENT'
  const { data } = useStudentApplicationState(isStudent)

  if (
    !isStudent ||
    pathname === APPLICATION_PATH ||
    !data ||
    data.complete ||
    !data.missingDetails.includes('mentorInformation')
  ) {
    return null
  }

  const yearName = data.academicYear?.name.replace('-', '–') ?? 'the current academic year'
  const isAnnualConfirmation = data.annualMentorRequired

  return (
    <section
      role="alert"
      aria-labelledby="annual-mentor-reminder-title"
      className="mb-5 flex flex-col gap-3 rounded-lg border border-warn/35 bg-warn-tint px-4 py-3 text-ink shadow-sm sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" strokeWidth={2} aria-hidden />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="annual-mentor-reminder-title" className="text-sm font-semibold">
              {isAnnualConfirmation ? 'Confirm your mentor information' : 'Complete your mentor information'}
            </h2>
            <span className="rounded-sm bg-warn px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-white uppercase">
              Required
            </span>
          </div>
          <p className="mt-0.5 text-[13px] leading-5 text-ink-2">
            {isAnnualConfirmation
              ? `Confirm your mentor servant's contact information for ${yearName}.`
              : 'Add your mentor servant\'s contact information to finish your Servants Prep application.'}
          </p>
        </div>
      </div>
      <Link
        href={APPLICATION_PATH}
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-warn px-3 text-[13px] font-semibold text-white no-underline hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warn"
      >
        Complete mentor form
        <ArrowRight className="size-3.5" strokeWidth={2} aria-hidden />
      </Link>
    </section>
  )
}
