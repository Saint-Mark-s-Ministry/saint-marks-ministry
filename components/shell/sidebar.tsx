'use client'

import Link from 'next/link'
import { Search } from 'lucide-react'
import type { UserRole } from '@prisma/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Initials } from '@/components/ds/person'
import type { Ministry, MinistryOption, NavGroup } from '@/lib/navigation'
import { isNavItemActive } from '@/lib/navigation'
import { cn } from '@/lib/utils'
import { MinistrySwitcher } from './ministry-switcher'
import { ThemeButton } from './theme-button'
import { UserMenuItems } from './user-menu'

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent('open-command-palette'))
}

/** Grouped nav: every destination one click away (design principle 2). */
export function NavList({
  groups,
  pathname,
  search,
  onNavigate,
  touch = false,
}: {
  groups: NavGroup[]
  pathname: string
  search: string
  onNavigate?: () => void
  /** 44px rows for the phone sheet. */
  touch?: boolean
}) {
  return (
    <div className="flex flex-col gap-[18px]">
      {groups.map((group, gi) => (
        <div key={group.label ?? gi} className="flex flex-col gap-px">
          {group.label && (
            <div className="sidebar-label mb-1 px-2.5 text-[11px] font-medium tracking-[0.06em] text-ink-3 uppercase">
              {group.label}
            </div>
          )}
          {group.items.map((item) => {
            const active = isNavItemActive(item.href, pathname, search)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                title={item.label}
                className={cn(
                  'sidebar-item flex items-center gap-2.5 rounded-md px-2.5 whitespace-nowrap no-underline transition-colors',
                  touch ? 'h-11 text-[15px]' : 'h-8 text-[13.5px]',
                  active ? 'bg-accent-tint font-medium text-accent-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'
                )}
              >
                <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="sidebar-label truncate">{item.label}</span>
              </Link>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export function Sidebar({
  ministry,
  ministries,
  groups,
  pathname,
  search,
  user,
  rail,
}: {
  ministry: Ministry
  ministries: MinistryOption[]
  groups: NavGroup[]
  pathname: string
  search: string
  user: { name?: string | null; role: UserRole; roleLabel: string; imageUrl?: string | null }
  rail: boolean
}) {
  return (
    <aside
      data-sidebar
      data-rail={rail ? 'true' : 'false'}
      aria-label="Main"
      className="sticky top-0 hidden h-dvh shrink-0 flex-col gap-3.5 overflow-hidden border-r border-line bg-sidebar-bg px-3 pt-3.5 pb-3 md:flex print:hidden"
    >
      <MinistrySwitcher
        current={ministry}
        options={ministries}
        className="sidebar-switcher h-[52px] w-full shrink-0 rounded-[10px] border border-line bg-surface pr-2.5 pl-2"
      />

      <button
        type="button"
        onClick={openCommandPalette}
        className="sidebar-search flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-[13px] text-ink-3 hover:border-line-strong"
        aria-label="Search (⌘K)"
      >
        <Search className="size-[15px] shrink-0" strokeWidth={1.75} aria-hidden />
        <span className="sidebar-label">Search</span>
        <kbd className="sidebar-label ml-auto rounded-[4px] border border-line-strong px-[5px] font-mono text-[11px] leading-[14px]">
          ⌘K
        </kbd>
      </button>

      {/* Only the nav scrolls, so the account row stays in view on short screens. */}
      <nav
        aria-label={ministry === 'sunday-school' ? 'Sunday School' : 'Servants Prep'}
        className="-mx-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3"
      >
        <NavList groups={groups} pathname={pathname} search={search} />
      </nav>

      <div className="sidebar-user flex shrink-0 items-center gap-2.5 border-t border-line px-1.5 pt-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md text-left outline-none focus-visible:outline-2 focus-visible:outline-accent-ink"
            aria-label="Account menu"
          >
            <Initials name={user.name} imageUrl={user.imageUrl} size={30} enlarge={false} />
            <span className="sidebar-label flex min-w-0 flex-col leading-[1.25]">
              <span className="truncate text-[13px] font-medium text-ink">{user.name}</span>
              <span className="truncate text-[11.5px] text-ink-3">{user.roleLabel}</span>
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <UserMenuItems role={user.role} ministry={ministry} />
          </DropdownMenuContent>
        </DropdownMenu>
        <ThemeButton className="sidebar-label shrink-0" />
      </div>
    </aside>
  )
}
