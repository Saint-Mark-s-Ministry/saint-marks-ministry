'use client'

import { Megaphone } from 'lucide-react'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { StatusBadge, type Tone } from '@/components/ds/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PageLoading } from '@/components/ui/page-loading'
import { newestReleasesFirst, releaseNotes, type ReleaseNote } from '@/lib/release-notes'
import { formatUTC } from '@/lib/utils'

// Release notes are shared reference content for every signed-in role.
const anyRole = () => true

const CHANGE_GROUPS: { key: keyof ReleaseNote['changes']; label: string; tone: Tone }[] = [
  { key: 'new', label: 'New', tone: 'accent' },
  { key: 'improved', label: 'Improved', tone: 'info' },
  { key: 'fixed', label: 'Fixed', tone: 'ok' },
]

export function WhatsNew() {
  const { status } = useAdminGuard(anyRole)
  if (status !== 'authenticated') return <PageLoading />

  return <ReleaseNotesList releases={releaseNotes} />
}

export function ReleaseNotesList({ releases }: { releases: readonly ReleaseNote[] }) {
  const sortedReleases = newestReleasesFirst(releases)

  return (
    <div className="content-reveal flex min-w-0 flex-col gap-6">
      <PageHeader title="What’s new" meta="The latest features, improvements, and fixes for your ministry portal." />

      {sortedReleases.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Megaphone aria-hidden />}
            title="Our next update starts here"
            message="Check back here for the latest features and improvements in Servants Prep and Sunday School."
          />
        </Panel>
      ) : (
        <div className="flex w-full max-w-4xl flex-col gap-5">
          {sortedReleases.map((release, index) => (
            <article key={release.id} id={release.id} aria-labelledby={`${release.id}-title`} className="scroll-mt-6 rounded-lg border border-line bg-surface p-5 md:p-6">
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
                <time dateTime={release.date}>
                  {formatUTC(`${release.date}T00:00:00Z`, { month: 'long', day: 'numeric', year: 'numeric' })}
                </time>
                {index === 0 && <StatusBadge tone="neutral" dot={false}>Latest update</StatusBadge>}
              </div>
              <h2 id={`${release.id}-title`} className="mt-3 text-lg font-semibold tracking-tight text-ink">
                <a href={`#${release.id}`} className="no-underline hover:underline underline-offset-4">{release.title}</a>
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink-2">{release.summary}</p>
              <div className="mt-5 flex flex-col gap-5">
                {CHANGE_GROUPS.map(({ key, label, tone }) => {
                  const changes = release.changes[key]
                  if (!changes?.length) return null
                  return (
                    <section key={key} aria-label={label}>
                      <h3><StatusBadge tone={tone} dot={false}>{label}</StatusBadge></h3>
                      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-ink-2">
                        {changes.map((change, changeIndex) => <li key={changeIndex}>{change}</li>)}
                      </ul>
                    </section>
                  )
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
