'use client'

import Link from 'next/link'
import { ArrowUpRight, BookOpen, CirclePlay } from 'lucide-react'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { StatusBadge } from '@/components/ds/status-badge'
import { Button } from '@/components/ui/button'
import { PageLoading } from '@/components/ui/page-loading'
import { LESSON_GUIDE_ID, lessonGuideSteps } from '@/lib/guides'
import { formatDateUTC } from '@/lib/utils'

// Guides are shared reference material, available to every signed-in account.
const anyRole = () => true

export function Guides() {
  const { session, status } = useAdminGuard(anyRole)
  if (status !== 'authenticated') return <PageLoading />

  const user = session?.user
  const showLessonsLink = Boolean(user?.sundaySchool?.hasAccess) && user?.role !== 'PARENT' && user?.role !== 'STUDENT'

  return (
    <div className="content-reveal flex min-w-0 flex-col gap-6">
      <PageHeader title="Guides" meta="Short videos and written steps to help you use the portal." />

      <article id={LESSON_GUIDE_ID} aria-labelledby="lesson-guide-title" className="scroll-mt-20 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <StatusBadge tone="accent" dot={false}>Sunday School</StatusBadge>
            <h2 id="lesson-guide-title" className="text-xl font-semibold tracking-tight text-ink">Add your Sunday School lesson</h2>
            <p className="max-w-2xl text-sm leading-6 text-ink-2">Find your assigned lesson, add its title and resource links, and save it to the portal.</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
              <span className="inline-flex items-center gap-1.5"><CirclePlay className="size-3.5" aria-hidden />45 seconds · On-screen captions</span>
              <span>Updated <time dateTime="2026-11-10">{formatDateUTC('2026-11-10T00:00:00Z')}</time></span>
            </div>
          </div>
          {showLessonsLink && <Button asChild variant="outline" className="self-start"><Link href="/dashboard/servants/lessons?view=list">Open Lessons<ArrowUpRight aria-hidden /></Link></Button>}
        </div>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,1fr)] xl:items-start">
          <div className="min-w-0 space-y-3">
            <div className="overflow-hidden rounded-lg border border-line bg-black">
              <video
                aria-label="Video guide: Add your Sunday School lesson"
                className="aspect-video w-full"
                controls
                playsInline
                preload="none"
                width={1920}
                height={1080}
                poster="/guides/sunday-school-lesson-upload.jpg"
              >
                <source src="/guides/sunday-school-lesson-upload.mp4" type="video/mp4" />
                <track kind="captions" src="/guides/sunday-school-lesson-upload.vtt" srcLang="en" label="English" />
                <a href="/guides/sunday-school-lesson-upload.mp4">Download the lesson video</a>
              </video>
            </div>
            <p className="text-xs leading-5 text-ink-3">This example uses fictional lesson data. Follow the written steps if you prefer to read.</p>
            <p className="rounded-md border border-line bg-surface px-3 py-2 text-[13px] leading-5 text-ink-2"><strong className="font-semibold text-ink">Using a phone?</strong> The video shows a computer. On your phone, open Lessons from the bottom menu and choose I teach. Lessons already uses a list, so skip the Calendar → List step.</p>
          </div>

          <Panel title={<span className="inline-flex items-center gap-2"><BookOpen className="size-4" aria-hidden />Step by step</span>} bodyClassName="p-4">
            <ol className="space-y-5">
              {lessonGuideSteps.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-tint text-xs font-semibold text-accent-ink">{index + 1}</span>
                  <div><h3 className="text-sm font-semibold text-ink">{step.title}</h3><p className="mt-1 text-[13px] leading-5 text-ink-2">{step.description}</p></div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <Panel bodyClassName="px-4">
          <details className="group">
            <summary className="cursor-pointer py-4 text-sm font-semibold text-ink">Having trouble adding a lesson?</summary>
            <dl className="grid gap-5 pb-5 text-[13px] leading-5 text-ink-2 md:grid-cols-2">
              <div><dt className="font-semibold text-ink">Where do I upload my file?</dt><dd className="mt-1">The lesson editor saves sharing links. Upload your file to Google Drive, OneDrive, or another service first. Upload schedule CSV is for teaching dates and assignments; use Edit lesson for your lesson materials.</dd></div>
              <div><dt className="font-semibold text-ink">I can’t find my lesson.</dt><dd className="mt-1">Check Your class in the sidebar or phone menu. I teach shows upcoming lessons assigned to you. Try Upcoming or Past, and ask your class coordinator to check the teaching assignment if needed.</dd></div>
              <div><dt className="font-semibold text-ink">My link won’t open.</dt><dd className="mt-1">Paste the full web sharing link, including https://. Check access permissions in the service that hosts the resource. Saving a link in the portal does not change those permissions.</dd></div>
              <div><dt className="font-semibold text-ink">The lesson won’t save.</dt><dd className="mt-1">Check the message beside the links. Each resource needs a name and a web link; remove any partly filled rows you don’t need. If the connection fails, your changes stay in the open editor so you can retry.</dd></div>
            </dl>
          </details>
        </Panel>
      </article>
    </div>
  )
}
