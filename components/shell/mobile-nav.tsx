'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MoreHorizontal, Search, X } from 'lucide-react'
import { signOut } from 'next-auth/react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { UserRole } from '@prisma/client'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { Initials } from '@/components/ds/person'
import { Button } from '@/components/ui/button'
import type { Ministry, MinistryOption, NavGroup } from '@/lib/navigation'
import { isNavItemActive } from '@/lib/navigation'
import { cn } from '@/lib/utils'
import { MinistrySwitcher } from './ministry-switcher'
import { NavList, openCommandPalette } from './sidebar'
import { ThemeButton } from './theme-button'
import { accountLinks } from './user-menu'

/** 56px phone app bar: ministry pill, search, alerts. */
export function MobileAppBar({ ministry, ministries }: { ministry: Ministry; ministries: MinistryOption[] }) {
  return (
    <header className="z-40 flex h-14 shrink-0 items-center gap-1 border-b border-line bg-canvas pr-2 pl-3 md:hidden print:hidden">
      <MinistrySwitcher current={ministry} options={ministries} compact className="h-11 px-1.5" />
      <div className="ml-auto flex items-center">
        <Button variant="ghost" size="icon" aria-label="Search" onClick={openCommandPalette}>
          <Search className="size-[18px]" strokeWidth={1.75} />
        </Button>
        <NotificationBell />
      </div>
    </header>
  )
}

/**
 * Four places + More (design system §07, "Tab bar · 5 slots"). More opens the
 * full grouped nav as a sheet, so nothing is hidden on phones either.
 */
export function MobileTabBar({
  ministry,
  ministries,
  groups,
  pathname,
  search,
  user,
}: {
  ministry: Ministry
  ministries: MinistryOption[]
  groups: NavGroup[]
  pathname: string
  search: string
  user: { name?: string | null; role: UserRole; roleLabel: string; imageUrl?: string | null }
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const items = groups.flatMap((g) => g.items)
  const tabs = items.filter((i) => i.tab).slice(0, 4)
  const tabActive = tabs.some((t) => isNavItemActive(t.href, pathname, search))
  const close = () => setMoreOpen(false)

  return (
    <>
      <nav
        aria-label="Primary"
        className="z-40 shrink-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
      >
        <ul className="grid grid-cols-5">
          {tabs.map((item) => {
            const active = isNavItemActive(item.href, pathname, search)
            const Icon = item.icon
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium no-underline',
                    active ? 'text-accent-ink' : 'text-ink-3'
                  )}
                >
                  <Icon className="size-[22px]" strokeWidth={active ? 2 : 1.75} aria-hidden />
                  {item.tabLabel ?? item.label}
                </Link>
              </li>
            )
          })}
          {Array.from({ length: 4 - tabs.length }).map((_, i) => (
            <li key={`spacer-${i}`} aria-hidden />
          ))}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              className={cn(
                'flex h-14 w-full cursor-pointer flex-col items-center justify-center gap-1 text-[11px] font-medium',
                !tabActive || moreOpen ? 'text-accent-ink' : 'text-ink-3'
              )}
            >
              <MoreHorizontal className="size-[22px]" strokeWidth={1.75} aria-hidden />
              More
            </button>
          </li>
        </ul>
      </nav>

      <DialogPrimitive.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(19,18,17,0.45)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 duration-200 motion-reduce:animate-none md:hidden" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col rounded-t-xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] text-ink data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom data-[state=open]:duration-300 data-[state=closed]:duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none md:hidden"
          >
            <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <MinistrySwitcher current={ministry} options={ministries} className="h-12 flex-1 px-1.5" />
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Close menu">
                  <X />
                </Button>
              </DialogPrimitive.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <button
                type="button"
                onClick={() => {
                  close()
                  openCommandPalette()
                }}
                className="mb-4 flex h-11 w-full cursor-pointer items-center gap-2 rounded-md border border-line bg-surface px-3 text-[15px] text-ink-3"
              >
                <Search className="size-4" aria-hidden />
                Search
              </button>
              <NavList groups={groups} pathname={pathname} search={search} onNavigate={close} touch />
              <div className="mt-[18px] flex flex-col gap-px">
                <div className="mb-1 px-2.5 text-[11px] font-medium tracking-[0.06em] text-ink-3 uppercase">Account</div>
                {accountLinks(user.role, ministry).map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={close}
                    className="flex h-11 items-center rounded-md px-2.5 text-[15px] text-ink-2 no-underline hover:bg-hover"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2.5 border-t border-line px-4 py-3">
              <Initials name={user.name} imageUrl={user.imageUrl} size={32} />
              <div className="flex min-w-0 flex-1 flex-col leading-[1.25]">
                <span className="truncate text-[14px] font-medium">{user.name}</span>
                <span className="truncate text-xs text-ink-3">{user.roleLabel}</span>
              </div>
              <ThemeButton />
              <Button variant="destructive" size="sm" onClick={() => signOut({ callbackUrl: '/login' })}>
                Sign out
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  )
}
