'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUpRight, BookOpen, CirclePlay } from 'lucide-react'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { StatusBadge } from '@/components/ds/status-badge'
import { Button } from '@/components/ui/button'
import { PageLoading } from '@/components/ui/page-loading'
import { GUIDE_MEDIA_VERSION, sundaySchoolGuides, type PortalGuide } from '@/lib/guides'
import { formatDateUTC } from '@/lib/utils'

// Shared reference material. Workflow routes independently enforce class access.
const anyRole = () => true

export function Guides() {
  const { session, status } = useAdminGuard(anyRole)
  useEffect(() => {
    if (status !== 'authenticated') return
    const guide = sundaySchoolGuides.find(item => `#${item.id}` === window.location.hash)
    if (!guide) return
    const frame = requestAnimationFrame(() => document.getElementById(guide.id)?.scrollIntoView())
    return () => cancelAnimationFrame(frame)
  }, [status])
  if (status !== 'authenticated') return <PageLoading />
  const user = session?.user
  const showWorkflowLinks = Boolean(user?.sundaySchool?.hasAccess) && user?.role !== 'PARENT' && user?.role !== 'STUDENT'

  return (
    <div className="content-reveal flex min-w-0 flex-col gap-8">
      <PageHeader title="Guides" meta="Short videos and written steps to help you use the portal." />
      <nav aria-label="Choose a guide" className="grid gap-3 sm:grid-cols-2">
        {sundaySchoolGuides.map(guide => (
          <a key={guide.id} href={`#${guide.id}`} className="group flex min-w-0 items-start gap-3 rounded-lg border border-line bg-surface p-4 no-underline transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink">
            <CirclePlay aria-hidden className="mt-0.5 size-5 shrink-0 text-accent-ink" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">{guide.title}</span><span className="mt-1 block text-xs leading-5 text-ink-3">{guide.seconds} seconds · Sunday School servants</span></span>
            <ArrowDown aria-hidden className="mt-1 size-4 shrink-0 text-ink-3" />
          </a>
        ))}
      </nav>
      <div className="space-y-10 divide-y divide-line">
        {sundaySchoolGuides.map((guide, index) => <GuideArticle key={guide.id} guide={guide} showWorkflowLink={showWorkflowLinks} className={index ? 'pt-10' : undefined} />)}
      </div>
    </div>
  )
}

function GuideArticle({ guide, showWorkflowLink, className = '' }: { guide: PortalGuide; showWorkflowLink: boolean; className?: string }) {
  return (
    <article id={guide.id} aria-labelledby={`${guide.id}-title`} className={`scroll-mt-24 space-y-5 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <StatusBadge tone="accent" dot={false}>Sunday School servants</StatusBadge>
          <h2 id={`${guide.id}-title`} className="text-xl font-semibold tracking-tight text-ink">{guide.title}</h2>
          <p className="max-w-2xl text-sm leading-6 text-ink-2">{guide.description}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
            <span className="inline-flex items-center gap-1.5"><CirclePlay className="size-3.5" aria-hidden />{guide.seconds} seconds · On-screen captions</span>
            <span>Updated <time dateTime="2026-11-10">{formatDateUTC('2026-11-10T00:00:00Z')}</time></span>
          </div>
        </div>
        {showWorkflowLink && <Button asChild variant="outline" className="self-start"><Link href={guide.openHref}>{guide.openLabel}<ArrowUpRight aria-hidden /></Link></Button>}
      </div>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,1fr)] xl:items-start">
        <div className="min-w-0 space-y-3">
          <div className="overflow-hidden rounded-lg border border-line bg-black">
            <video aria-label={`Video guide: ${guide.title}`} className="aspect-video w-full" controls playsInline preload="none" width={1920} height={1080} poster={`/guides/${guide.media}.jpg?v=${GUIDE_MEDIA_VERSION}`} onPlay={event => {
              // A new tutorial stops any other tutorial the viewer left playing.
              document.querySelectorAll('video').forEach(video => { if (video !== event.currentTarget) video.pause() })
            }}>
              <source src={`/guides/${guide.media}.mp4?v=${GUIDE_MEDIA_VERSION}`} type="video/mp4" />
              <track kind="captions" src={`/guides/${guide.media}.vtt?v=${GUIDE_MEDIA_VERSION}`} srcLang="en" label="English" />
              <a href={`/guides/${guide.media}.mp4?v=${GUIDE_MEDIA_VERSION}`}>Download the video</a>
            </video>
          </div>
          <p className="text-xs leading-5 text-ink-3">This example uses fictional data and the desktop website. Follow the written steps if you prefer to read.</p>
          <p className="rounded-md border border-line bg-surface px-3 py-2 text-[13px] leading-5 text-ink-2"><strong className="font-semibold text-ink">Using a phone?</strong> {guide.phoneNote}</p>
        </div>
        <Panel title={<span className="inline-flex items-center gap-2"><BookOpen className="size-4" aria-hidden />Step by step</span>} bodyClassName="p-4">
          <ol className="space-y-5">
            {guide.steps.map((step, index) => <li key={step.title} className="flex gap-3">
              <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-tint text-xs font-semibold text-accent-ink">{index + 1}</span>
              <div><h3 className="text-sm font-semibold text-ink">{step.title}</h3><p className="mt-1 text-[13px] leading-5 text-ink-2">{step.description}</p></div>
            </li>)}
          </ol>
        </Panel>
      </div>
      <Panel bodyClassName="px-4">
        <details>
          <summary className="cursor-pointer py-4 text-sm font-semibold text-ink">Questions and troubleshooting</summary>
          <dl className="grid gap-5 pb-5 text-[13px] leading-5 text-ink-2 md:grid-cols-2">
            {guide.help.map(item => <div key={item.title}><dt className="font-semibold text-ink">{item.title}</dt><dd className="mt-1">{item.description}</dd></div>)}
          </dl>
        </details>
      </Panel>
    </article>
  )
}
