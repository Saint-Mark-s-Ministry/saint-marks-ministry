'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronsUpDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Ministry, MinistryOption } from '@/lib/navigation'
import { MINISTRY_NAMES } from '@/lib/navigation'
import { MinistryMark } from './ministry-mark'
import { cn } from '@/lib/utils'
import { useShortcutModifier } from '@/hooks/useShortcutModifier'

/**
 * Lists only the ministries this person can open; with one, it is a plain
 * label (design system §05). Platform-specific shortcuts follow menu order
 * (see AppShell) and stay hidden on phone layouts.
 */
export function MinistrySwitcher({
  current,
  options,
  compact = false,
  className,
}: {
  current: Ministry
  options: MinistryOption[]
  /** Phone app bar pill. */
  compact?: boolean
  className?: string
}) {
  // Controlled so it closes once the new ministry renders; the shell stays mounted
  // across navigation, and an uncontrolled menu could stay open over the new page.
  const [open, setOpen] = useState(false)
  const shortcutModifier = useShortcutModifier()
  useEffect(() => setOpen(false), [current])

  const label = (
    <>
      <MinistryMark ministry={current} size={compact ? 26 : 32} />
      <span className={cn('flex min-w-0 flex-col text-left leading-[1.2]', compact && 'leading-none')}>
        <span className="truncate text-sm font-semibold text-ink">{MINISTRY_NAMES[current]}</span>
        {!compact && <span className="truncate text-[11.5px] text-ink-3 sidebar-label">St. Mark Ministry</span>}
      </span>
    </>
  )

  if (options.length <= 1) {
    return <div className={cn('flex min-w-0 items-center gap-2.5', className)}>{label}</div>
  }

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className={cn(
          'flex min-w-0 cursor-pointer items-center gap-2.5 rounded-md text-left outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent-ink',
          className
        )}
        aria-label={`Ministry: ${MINISTRY_NAMES[current]}. Switch ministry`}
      >
        {label}
        <ChevronsUpDown className="sidebar-label ml-auto size-3.5 shrink-0 text-ink-3" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-[11px] font-medium tracking-[0.06em] text-ink-3 uppercase">
          Your ministries
        </DropdownMenuLabel>
        {options.map((option, i) => (
          <DropdownMenuItem key={option.id} asChild onSelect={() => setOpen(false)}>
            <Link href={option.href} className="flex cursor-pointer items-center gap-2.5 py-2">
              <MinistryMark ministry={option.id} size={28} />
              <span className="flex-1 text-[13.5px] font-medium">{option.name}</span>
              {option.id === current ? (
                <Check className="size-4 text-accent-ink" aria-label="Current" />
              ) : shortcutModifier ? (
                <kbd className="hidden font-mono text-[11px] text-ink-3 md:inline">
                  {shortcutModifier}{i + 1}
                </kbd>
              ) : null}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
