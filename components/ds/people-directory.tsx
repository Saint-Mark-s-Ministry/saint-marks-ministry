import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Shared directory layout for user management and the contact book. */
export function PeopleTable({ header, children, empty, label }: {
  header: ReactNode
  children: ReactNode
  empty?: ReactNode
  label?: string
}) {
  return (
    <div className="hidden overflow-x-auto lg:block">
      <table aria-label={label} className="w-full text-[13px] text-ink">
        <thead className="bg-raised text-xs text-ink-3 [&_th]:h-9 [&_th]:font-medium">
          {header}
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  )
}

export function PeopleTableRow({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn('h-[52px] border-b border-line', className)}>{children}</tr>
}

export function PeopleCardList({ children }: { children: ReactNode }) {
  return <div className="space-y-1 lg:hidden">{children}</div>
}

export function PeopleCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 rounded-md border border-line p-2', className)}>
      {children}
    </div>
  )
}
