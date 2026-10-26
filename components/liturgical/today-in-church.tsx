'use client'

import Link from 'next/link'
import { BookOpenText } from 'lucide-react'
import { Panel } from '@/components/ds/panel'
import { StatusBadge } from '@/components/ds/status-badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useLiturgicalDay } from '@/lib/swr'
import { CalendarSubscribeButton } from '@/components/liturgical/calendar-subscribe-button'
import { useChurchToday } from '@/components/liturgical/use-church-today'
import { headlineReading, isLordlyFeast, notableFeasts, type LiturgicalDay } from '@/lib/liturgical'

const SAINTS_SHOWN = 3

function saintsSentence(names: string[]): string {
  if (names.length <= SAINTS_SHOWN) return names.join(' · ')
  const rest = names.length - SAINTS_SHOWN
  return `${names.slice(0, SAINTS_SHOWN).join(' · ')} · and ${rest} more`
}

/**
 * "Today in the Church": the Coptic date, season, fast, feasts, the day's
 * Gospel and the saints of the Synaxarium. Shown on every dashboard, for every
 * role. Coptic IO is a third party, so a failure renders a quiet line rather
 * than an error, and the card never holds up the page around it.
 */
export function TodayInChurch({ className }: { className?: string }) {
  const today = useChurchToday()
  const { data, error, isLoading } = useLiturgicalDay(today)

  return (
    <Panel
      className={className}
      title="Today in the Church"
      description={data?.copticDate?.label ?? (isLoading ? 'Loading the church calendar…' : undefined)}
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/readings">
            <BookOpenText aria-hidden />
            Readings
          </Link>
        </Button>
      }
      bodyClassName="px-4 py-3"
      footer={
        <>
          <span>Feasts and fasts in your own calendar</span>
          <span className="ml-auto">
            <CalendarSubscribeButton variant="ghost" />
          </span>
        </>
      }
    >
      {isLoading ? (
        <div className="flex flex-col gap-2" aria-hidden>
          <Skeleton className="h-5 w-2/3 bg-hover" />
          <Skeleton className="h-4 w-1/2 bg-hover" />
        </div>
      ) : error || !data?.available ? (
        <p className="text-[13px] text-ink-3">The church calendar is unavailable right now.</p>
      ) : (
        <TodayInChurchBody day={data} />
      )}
    </Panel>
  )
}

function TodayInChurchBody({ day }: { day: LiturgicalDay }) {
  const feasts = notableFeasts(day.feasts)
  const gospel = headlineReading(day.readings)
  const fast = day.fasting?.fast ?? null

  return (
    <div className="flex flex-col gap-2.5 text-[13px]">
      <div className="flex flex-wrap items-center gap-1.5">
        {feasts.map((feast) => (
          <StatusBadge key={feast.name} tone={isLordlyFeast(feast) ? 'gold' : 'accent'}>
            {feast.name}
          </StatusBadge>
        ))}
        {day.season && <StatusBadge tone="info">{day.season.name}</StatusBadge>}
        {fast ? (
          <StatusBadge tone="warn">{fast.name}</StatusBadge>
        ) : (
          day.fasting && <StatusBadge tone="neutral">No fast today</StatusBadge>
        )}
      </div>
      {day.seasonDay && <p className="text-ink-3">{day.seasonDay}</p>}
      {/* Optional chaining: a response cached before reading cycles existed has none. */}
      {day.readingCycle?.available === false ? (
        <p className="text-ink-3">Today’s readings aren’t available yet.</p>
      ) : gospel && (
        <p className="text-ink-2">
          <span className="text-ink-3">{gospel.label}:</span>{' '}
          <Link href="/dashboard/readings" className="font-medium text-accent-ink hover:underline">
            {gospel.reference}
          </Link>
        </p>
      )}
      {day.saints.length > 0 && (
        <p className="text-ink-2">
          <span className="text-ink-3">Commemorated:</span> {saintsSentence(day.saints.map((saint) => saint.name))}
        </p>
      )}
    </div>
  )
}
