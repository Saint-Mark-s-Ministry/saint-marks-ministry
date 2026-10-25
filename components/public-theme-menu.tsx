'use client'

import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** Uses the portal's system default, with an explicit way to restore it. */
export function PublicThemeMenu() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const selected = mounted ? theme ?? 'system' : 'system'
  const Icon = selected === 'light' ? Sun : selected === 'dark' ? Moon : Monitor

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Choose appearance" className="inline-flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink">
          <Icon className="size-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="motion-reduce:animate-none">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={selected} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="system" className="min-h-11 gap-2"><Monitor aria-hidden="true" />Use device setting</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light" className="min-h-11 gap-2"><Sun aria-hidden="true" />Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" className="min-h-11 gap-2"><Moon aria-hidden="true" />Dark</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
