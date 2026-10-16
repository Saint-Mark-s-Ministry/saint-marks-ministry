'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { useSundaySchoolAttendanceReminders } from '@/lib/swr'
import { formatDateUTC } from '@/lib/utils'

export function SundaySchoolAttendanceReminderBanner() {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const enabled = status === 'authenticated' && pathname.startsWith('/dashboard/servants')
  const { data } = useSundaySchoolAttendanceReminders(enabled ? session?.user?.id : undefined)
  if (!enabled || !data?.reminders.length) return null

  return (
    <section
      role="alert"
      aria-labelledby="sunday-school-attendance-reminder-title"
      className="mb-5 rounded-lg border border-warn/35 bg-warn-tint px-4 py-3 text-ink shadow-sm"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="sunday-school-attendance-reminder-title" className="text-sm font-semibold">Take attendance for your class</h2>
          <p className="mt-0.5 text-[13px] leading-5 text-ink-2">Please complete this week’s class attendance. This reminder clears once your class attendance is saved.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {data.reminders.map(reminder => (
              <li key={reminder.classId} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">{reminder.className} · {formatDateUTC(reminder.sessionDate)}</span>
                <Link href={reminder.url} className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-warn px-3 text-[13px] font-semibold text-white no-underline hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warn">
                  Take attendance <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
