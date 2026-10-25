'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useStudentProfileModal } from '@/components/student-profile-provider'

export function StudentProfileLink({ studentId, children, className }: {
  studentId: string
  children: ReactNode
  className?: string
}) {
  const openProfile = useStudentProfileModal()
  return (
    <Link
      href={`/dashboard/admin/students/${encodeURIComponent(studentId)}`}
      className={cn('rounded-sm font-medium underline-offset-4 hover:text-maroon-700 hover:underline dark:hover:text-maroon-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon-500', className)}
      aria-haspopup="dialog"
      data-no-page-transition={openProfile ? true : undefined}
      onClick={event => {
        event.stopPropagation()
        if (openProfile && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
          event.preventDefault()
          openProfile(studentId, event.currentTarget)
        }
      }}
    >
      {children}
    </Link>
  )
}
