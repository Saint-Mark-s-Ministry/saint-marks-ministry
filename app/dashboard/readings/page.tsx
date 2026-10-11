'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { useDailyReadings, useLiturgicalDay } from '@/lib/swr'
import {
  READING_SERVICE_LABELS,
  addDaysToDateKey,
  isLiturgicalDateKey,
  isLordlyFeast,
  notableFeasts,
  type LiturgicalLanguage,
  type ReadingSection,
  type ReadingService,
  type SynaxariumStory,
} from '@/lib/liturgical'
import { getSundaySchoolTodayDateInputValue } from '@/lib/sunday-school-class'
import { formatDateUTC } from '@/lib/utils'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { Segmented } from '@/components/ds/segmented'
import { StatusBadge } from '@/components/ds/status-badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PageLoading } from '@/components/ui/page-loading'
import { CalendarSubscribeButton } from '@/components/liturgical/calendar-subscribe-button'

// Every signed-in role may read the Katameros; the page only needs a session.
const anyRole = () => true

const SERVICE_ORDER: ReadingService[] = ['vespers', 'matins', 'liturgy', 'evening']

export default function DailyReadingsPage() {
  // useSearchParams needs a Suspense boundary to prerender.
  return (
    <Suspense fallback={<PageLoading />}>
      <DailyReadings />
    </Suspense>
  )
}

function DailyReadings() {
  const { status } = useAdminGuard(anyRole)
  const searchParams = useSearchParams()
  const [today] = useState(() => getSundaySchoolTodayDateInputValue())
  // Calendar feast chips link here with ?date=YYYY-MM-DD.
  const [date, setDate] = useState(() => {
    const requested = searchParams.get('date')
    return isLiturgicalDateKey(requested) ? requested : today
  })
  const [lang, setLang] = useState<LiturgicalLanguage>('en')

  const { data, error, isLoading } = useDailyReadings(date, lang)
  const { data: day } = useLiturgicalDay(date, lang)

  if (status === 'loading') return <PageLoading />

  const readings = data?.date === date && data.language === lang ? data : undefined
  const feasts = notableFeasts(day?.feasts ?? [])
  const fast = day?.fasting?.fast ?? null
  const rtl = lang === 'ar'

  return (
    <div className="content-reveal flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Daily readings"
        meta={[
          formatDateUTC(`${date}T00:00:00Z`, { weekday: 'long' }),
          day?.copticDate?.label ?? readings?.copticDate?.label,
          day?.season?.name ?? readings?.season,
          readings?.seasonDay,
        ]}
        actions={
          <>
            <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => setDate(addDaysToDateKey(date, -1))}>
              <ChevronLeft />
            </Button>
            <Input
              type="date"
              aria-label="Reading date"
              value={date}
              onChange={(event) => isLiturgicalDateKey(event.target.value) && setDate(event.target.value)}
              className="w-auto"
            />
            <Button variant="outline" size="icon" aria-label="Next day" onClick={() => setDate(addDaysToDateKey(date, 1))}>
              <ChevronRight />
            </Button>
            {date !== today && (
              <Button variant="outline" size="sm" onClick={() => setDate(today)}>
                Today
              </Button>
            )}
            <Segmented
              label="Language"
              value={lang}
              onChange={setLang}
              options={[
                { value: 'en', label: 'English' },
                { value: 'ar', label: 'العربية' },
              ]}
            />
            <CalendarSubscribeButton />
          </>
        }
      />

      {(feasts.length > 0 || fast) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {feasts.map((feast) => (
            <StatusBadge key={feast.name} tone={isLordlyFeast(feast) ? 'gold' : 'accent'}>
              {feast.name}
            </StatusBadge>
          ))}
          {fast && <StatusBadge tone="warn">{fast.name}</StatusBadge>}
        </div>
      )}

      {error && !readings ? (
        <Panel>
          <EmptyState
            title="Readings unavailable"
            message="We couldn’t reach the Coptic calendar service. Try again in a moment."
          />
        </Panel>
      ) : !readings || isLoading ? (
        <PageLoading />
      ) : (
        <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-5" dir={rtl ? 'rtl' : undefined} lang={lang}>
            {readings.sections.length === 0 ? (
              <Panel>
                <EmptyState message="No readings are listed for this day." />
              </Panel>
            ) : (
              SERVICE_ORDER.map((service) => {
                const sections = readings.sections.filter((section) => section.service === service)
                if (sections.length === 0) return null
                return (
                  <Panel key={service} title={READING_SERVICE_LABELS[service]} bodyClassName="divide-y divide-line">
                    {sections.map((section) => (
                      <ReadingBlock key={section.key} section={section} />
                    ))}
                  </Panel>
                )
              })
            )}
          </div>
          <SynaxariumPanel stories={readings.synaxarium} rtl={rtl} lang={lang} />
        </div>
      )}

      <p className="text-xs text-ink-3">
        Readings, Synaxarium and calendar from{' '}
        <a href="https://coptic.io" target="_blank" rel="noreferrer" className="underline hover:text-ink-2">
          Coptic IO
        </a>
        . English Scripture is the New King James Version.
      </p>
    </div>
  )
}

function ReadingBlock({ section }: { section: ReadingSection }) {
  return (
    <article className="flex flex-col gap-2 px-4 py-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 className="text-[13px] font-semibold text-ink">{section.label}</h3>
        <span className="text-xs text-ink-3" dir="ltr">
          {section.passages.map((passage) => passage.reference).join(' · ')}
        </span>
      </header>
      {section.passages.map((passage, index) => (
        <div key={`${passage.reference}-${index}`} className="flex flex-col gap-1.5">
          {section.passages.length > 1 && <p className="text-xs font-medium text-ink-3">{passage.reference}</p>}
          {passage.chapters.map((chapter) => (
            <p key={chapter.chapter} className="text-[15px] leading-7 text-ink-2">
              {chapter.verses.map((verse) => (
                <span key={verse.num}>
                  <sup className="mr-0.5 text-[10px] text-ink-3 tabular">{verse.num}</sup>
                  {verse.text}{' '}
                </span>
              ))}
            </p>
          ))}
        </div>
      ))}
    </article>
  )
}

function SynaxariumPanel({ stories, rtl, lang }: { stories: SynaxariumStory[]; rtl: boolean; lang: LiturgicalLanguage }) {
  return (
    <Panel
      title="Synaxarium"
      description={stories.length > 0 ? `${stories.length} commemorated on this day` : undefined}
    >
      <div dir={rtl ? 'rtl' : undefined} lang={lang} className="divide-y divide-line">
        {stories.length === 0 ? (
          <EmptyState message="No commemorations are listed for this day." />
        ) : (
          stories.map((story, index) =>
            story.text ? (
              <details key={`${story.name}-${index}`} className="group px-4 py-3">
                <summary className="cursor-pointer text-[13.5px] font-medium text-ink marker:text-ink-3">{story.name}</summary>
                <p className="mt-2 text-[13.5px] leading-6 whitespace-pre-line text-ink-2">{story.text}</p>
              </details>
            ) : (
              <p key={`${story.name}-${index}`} className="px-4 py-3 text-[13.5px] font-medium text-ink">
                {story.name}
              </p>
            )
          )
        )}
      </div>
    </Panel>
  )
}
