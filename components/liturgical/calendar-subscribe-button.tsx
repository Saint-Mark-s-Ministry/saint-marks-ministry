'use client'

import { CalendarPlus, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { calendarSubscriptionLinks } from '@/lib/liturgical'

/**
 * Subscribe your own calendar app to the Coptic Orthodox calendar (feasts,
 * fasts, seasons) from Coptic IO's live iCal feed. The subscription is between
 * the person's calendar app and Coptic IO; it updates itself daily.
 */
export function CalendarSubscribeButton({
  variant = 'outline',
  label = 'Subscribe',
}: {
  variant?: 'outline' | 'ghost'
  label?: string
}) {
  const links = calendarSubscriptionLinks()

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(links.https)
      toast.success('Calendar link copied', { description: 'Paste it into your calendar app’s “subscribe by URL” option.' })
    } catch {
      toast.error('Couldn’t copy the link', { description: links.https })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size="sm">
          <CalendarPlus aria-hidden />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-ink-3">
          Feasts, fasts and seasons of the Coptic Orthodox Church, kept up to date in your own calendar.
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={links.webcal}>Apple Calendar / Outlook app</a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={links.google} target="_blank" rel="noreferrer">
            Google Calendar<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={links.outlookWeb} target="_blank" rel="noreferrer">
            Outlook.com<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={copy}>
          <Copy aria-hidden />
          Copy calendar link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
