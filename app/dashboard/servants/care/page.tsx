'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Cake, CalendarX, Phone, Star } from 'lucide-react'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { StatusBadge } from '@/components/ds/status-badge'
import { Initials } from '@/components/ds/person'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageLoading } from '@/components/ui/page-loading'
import { CareHubTabs } from '@/components/sunday-school-care-tabs'
import { StudentName } from '@/components/student-history-provider'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'
import { useSundaySchoolBirthdays, useSundaySchoolVisitations } from '@/lib/swr'
import { ALL_CLASSES, useViewingClassId } from '@/lib/sunday-school-viewing'
import { buildFollowUps, FOLLOW_UP_ABSENT_WEEKS, type FollowUpItem } from '@/lib/sunday-school-follow-up'
import { formatBirthday } from '@/lib/sunday-school-birthdays'
import { localDayKey } from '@/components/ds/calendar'
import { formatDateUTC } from '@/lib/utils'
import type { SundaySchoolBirthdayChild, SundaySchoolVisitationsResponse } from '@/types/sunday-school'

const CALL_OUTCOMES: Record<string, string> = {
  CONNECTED: 'connected',
  LEFT_VOICEMAIL: 'left voicemail',
  NO_ANSWER: 'no answer',
  OTHER: 'other',
}

function birthdayLabel(days: number) {
  if (days === 0) return 'Birthday today'
  if (days === 1) return 'Birthday tomorrow'
  return `Birthday in ${days} days`
}

function Reasons({ item }: { item: FollowUpItem }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {item.reasons.includes('absent') && (
        <StatusBadge tone="bad">
          Absent {item.absentWeeks} weeks in a row
        </StatusBadge>
      )}
      {item.reasons.includes('priority') && <StatusBadge tone="warn">Priority visit</StatusBadge>}
      {item.reasons.includes('birthday') && item.birthdayInDays !== null && (
        <StatusBadge tone="gold" dot={false}>
          <Cake className="size-3" aria-hidden />
          {birthdayLabel(item.birthdayInDays)}
        </StatusBadge>
      )}
    </span>
  )
}

function contactText(item: FollowUpItem) {
  if (item.lastContact) {
    const when = formatDateUTC(item.lastContact.date, { year: undefined })
    return item.lastContact.kind === 'call'
      ? `Called ${when}${item.lastContact.outcome ? ` · ${CALL_OUTCOMES[item.lastContact.outcome] ?? ''}` : ''}`
      : `Visited ${when}`
  }
  if (item.reasons.includes('absent')) {
    return `No call or visit logged since ${item.absentSince ? formatDateUTC(item.absentSince, { year: undefined }) : 'the absences began'}`
  }
  if (item.reasons.includes('priority')) return 'No visit recorded yet'
  return item.birthDate ? formatBirthday(item.birthDate) : ''
}

/**
 * Care → Follow up: the one list of children who need a servant this week.
 * It reads the same records as Visits & calls and Birthdays; nothing here is
 * stored separately.
 */
export default function SundaySchoolCarePage() {
  const { status } = useSundaySchoolGuard()
  const { data, error, isLoading } = useSundaySchoolVisitations()
  const { data: birthdaysData } = useSundaySchoolBirthdays()
  const response = data as SundaySchoolVisitationsResponse | undefined
  const classes = useMemo(() => response?.classes ?? [], [response])
  const [viewing] = useViewingClassId(classes, { allowAll: true })

  const items = useMemo(() => {
    const scoped = viewing === ALL_CLASSES ? classes : classes.filter(cls => cls.id === viewing)
    return buildFollowUps(scoped, (birthdaysData as SundaySchoolBirthdayChild[] | undefined) ?? [], localDayKey())
  }, [birthdaysData, classes, viewing])

  if (status === 'loading' || isLoading) return <PageLoading />

  const viewingClass = classes.find(cls => cls.id === viewing)
  const urgent = items.filter(item => item.reasons.includes('absent') || item.reasons.includes('priority'))
  const birthdays = items.filter(item => item.reasons.includes('birthday'))
  const readOnly = response?.standing.readOnly ?? false

  return (
    <div className="content-reveal flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Care"
        meta={[viewingClass?.name ?? (classes.length > 1 ? 'All your classes' : classes[0]?.name), 'Who needs a call, a visit or a card this week']}
      />
      <CareHubTabs followUpCount={urgent.length} />

      {readOnly && (
        <div role="status" className="rounded-lg bg-info-tint px-4 py-2.5 text-[13px] text-info">
          You can review follow-up for every class. Servants of each class log the calls and visits.
        </div>
      )}

      {error ? (
        <Panel>
          <EmptyState title="Couldn’t load follow-up" message="Something went wrong on our side. Try again in a moment." />
        </Panel>
      ) : classes.length === 0 ? (
        <Panel>
          <EmptyState message="You are not assigned to a Sunday School class yet." />
        </Panel>
      ) : (
        <>
          <Panel
            title="Needs a call or visit"
            description={`Absent ${FOLLOW_UP_ABSENT_WEEKS}+ meetings in a row, or starred for a priority visit`}
          >
            {urgent.length === 0 ? (
              <EmptyState message="Everyone is coming. Nobody needs a call this week." />
            ) : (
              <FollowUpList items={urgent} showClass={viewing === ALL_CLASSES && classes.length > 1} />
            )}
          </Panel>

          <Panel
            title="Birthdays this week"
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/servants/birthdays">All birthdays</Link>
              </Button>
            }
          >
            {birthdays.length === 0 ? (
              <EmptyState message="No birthdays in the next 7 days." />
            ) : (
              <FollowUpList
                items={birthdays}
                showClass={viewing === ALL_CLASSES && classes.length > 1}
                birthdaysOnly
              />
            )}
          </Panel>
        </>
      )}
    </div>
  )
}

function FollowUpList({ items, showClass, birthdaysOnly = false }: { items: FollowUpItem[]; showClass: boolean; birthdaysOnly?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {items.map(item => {
        const Icon = birthdaysOnly ? Cake : item.reasons.includes('absent') ? CalendarX : Star
        return (
          <li key={item.childId} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
            <span className="flex min-w-0 flex-1 items-start gap-3">
              <span className="relative shrink-0">
                <Initials name={item.name} size={36} />
                <span
                  aria-hidden
                  className="absolute -right-1 -bottom-1 flex size-[18px] items-center justify-center rounded-full border-2 border-surface bg-surface"
                >
                  <Icon className={birthdaysOnly ? 'size-3 text-gold' : item.reasons.includes('absent') ? 'size-3 text-bad' : 'size-3 fill-warn text-warn'} />
                </span>
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <StudentName id={item.childId} name={item.name} className="truncate text-[14px]" />
                  {showClass && <span className="truncate text-xs text-ink-3">{item.className}</span>}
                </span>
                {birthdaysOnly ? (
                  <span className="text-xs text-ink-3">
                    {item.birthDate ? formatBirthday(item.birthDate) : ''} · {item.birthdayInDays !== null ? birthdayLabel(item.birthdayInDays) : ''}
                  </span>
                ) : (
                  <>
                    <Reasons item={item} />
                    <span className="text-xs text-ink-3">{contactText(item)}</span>
                  </>
                )}
              </span>
            </span>
            {!birthdaysOnly && (
              <span className="flex shrink-0 gap-2 pl-12 sm:pl-0">
                <Button asChild variant={item.canEdit ? 'default' : 'outline'} size="sm" className="flex-1 sm:flex-none">
                  <Link href={`/dashboard/servants/visitations?childId=${item.childId}`}>
                    {item.canEdit && <Phone aria-hidden />}
                    {item.canEdit ? 'Log call or visit' : 'Open record'}
                  </Link>
                </Button>
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
