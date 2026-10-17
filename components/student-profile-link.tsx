import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function StudentProfileLink({ studentId, children, className }: {
  studentId: string
  children: ReactNode
  className?: string
}) {
  return (
    <Link
      href={`/dashboard/admin/students/${encodeURIComponent(studentId)}`}
      className={cn('rounded-sm font-medium underline-offset-4 hover:text-maroon-700 hover:underline dark:hover:text-maroon-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon-500', className)}
      onClick={event => event.stopPropagation()}
    >
      {children}
    </Link>
  )
}
