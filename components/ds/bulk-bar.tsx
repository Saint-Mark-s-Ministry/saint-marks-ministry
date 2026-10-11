'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Appears when rows are checked; holds actions for the selection (research finding 01). */
export function BulkBar({
  count,
  noun = 'selected',
  onClear,
  children,
}: {
  count: number
  noun?: string
  onClear: () => void
  children: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="flex animate-in flex-wrap items-center gap-2 border-b border-line bg-accent-tint px-3 py-2 fade-in-0 slide-in-from-top-1 duration-150 motion-reduce:animate-none"
    >
      <span className="tabular text-[13px] font-medium text-ink">
        {count} {noun}
      </span>
      <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Clear selection">
        <X />
      </Button>
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}
