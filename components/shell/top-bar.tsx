'use client'

import Link from 'next/link'
import { CalendarDays, ChevronDown, ChevronRight, PanelLeft, Settings2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { useAcademicYears } from '@/lib/swr'
import { MINISTRY_NAMES, type Ministry } from '@/lib/navigation'

const yearLabel = (name: string) => name.replace('-', '–')

/** 52px bar: rail toggle, breadcrumb, active year, alerts (design system §07). */
export function TopBar({
  ministry,
  homeHref,
  page,
  onToggleRail,
  railCollapsed,
  showYear,
  yearHref,
}: {
  ministry: Ministry
  homeHref: string
  page: string | null
  onToggleRail: () => void
  railCollapsed: boolean
  showYear: boolean
  yearHref?: string
}) {
  const { data: years } = useAcademicYears(showYear)
  const active = years?.find((y) => y.isActive)

  return (
    <div className="sticky top-0 z-40 hidden h-[52px] shrink-0 items-center gap-3 border-b border-line bg-canvas/95 px-7 backdrop-blur-sm md:flex print:hidden">
      <button
        type="button"
        onClick={onToggleRail}
        aria-label={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-pressed={railCollapsed}
        className="-ml-2 hidden size-[30px] cursor-pointer items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink xl:flex"
      >
        <PanelLeft className="size-4" strokeWidth={1.75} />
      </button>
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
        <Link href={homeHref} className="text-ink-3 no-underline hover:text-ink">
          {MINISTRY_NAMES[ministry]}
        </Link>
        {page && (
          <>
            <ChevronRight className="size-3.5 shrink-0 text-ink-3" aria-hidden />
            <span aria-current="page" className="truncate font-medium text-ink">
              {page}
            </span>
          </>
        )}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        {showYear && active && (
          <DropdownMenu>
            <DropdownMenuTrigger
              title="Academic year"
              className="inline-flex h-[30px] cursor-pointer items-center gap-[7px] rounded-md border border-line-strong bg-surface px-2.5 text-[13px] font-medium whitespace-nowrap text-ink outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent-ink"
            >
              <CalendarDays className="size-[15px]" strokeWidth={1.75} aria-hidden />
              <span className="sr-only">Active academic year: </span>
              {yearLabel(active.name)}
              <ChevronDown className="size-3.5 text-ink-3" strokeWidth={1.75} aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-[11px] font-medium tracking-[0.06em] text-ink-3 uppercase">
                Academic years
              </DropdownMenuLabel>
              {years!.map((year) => (
                <DropdownMenuItem key={year.id} disabled className="justify-between data-[disabled]:opacity-100">
                  <span className={year.isActive ? 'font-medium text-ink' : 'text-ink-3'}>{yearLabel(year.name)}</span>
                  {year.isActive && <span className="text-[11.5px] text-accent-ink">Active</span>}
                </DropdownMenuItem>
              ))}
              {yearHref && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={yearHref} className="cursor-pointer">
                      <Settings2 className="size-4" strokeWidth={1.75} aria-hidden />
                      Manage academic years
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <NotificationBell />
      </div>
    </div>
  )
}
