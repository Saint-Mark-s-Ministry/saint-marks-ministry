import { prepGuideMediaKey } from '@/lib/sp-guide-encryption'
import { PrepGuideVideo } from '@/components/guides/prep-guide-video'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requirePrepGuideViewer } from '@/lib/sp-guide-auth'
import { prepGuides } from '@/lib/sp-guides'
import { PageHeader } from '@/components/ds/page-header'

export const metadata = { title: 'Servants Prep staff guides | St. Mark Ministry Portal' }
export default async function PrepGuidesPage() {
  try { await requirePrepGuideViewer() } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') redirect('/login')
    notFound()
  }
  try { prepGuideMediaKey() } catch {
    return <div className="space-y-4"><PageHeader title="Servants Prep staff guides" /><p role="status">Staff guides are temporarily unavailable. Please try again later.</p></div>
  }
  return <div className="flex min-w-0 flex-col gap-7">
    <PageHeader title="Servants Prep staff guides" meta="Short walkthroughs for SP servants, super admins, and priests." />
    <nav aria-label="Servants Prep guides" className="grid gap-3 sm:grid-cols-2">{prepGuides.map(g => <a key={g.id} href={`#${g.id}`} className="rounded-lg border border-line bg-surface p-4 font-medium">{g.title}</a>)}</nav>
    {prepGuides.map(g => <article key={g.id} id={g.id} className="scroll-mt-24 space-y-4 rounded-lg border border-line bg-surface p-4 md:p-6">
      <h2 className="text-xl font-semibold">{g.title}</h2>
      <p className="text-sm text-ink-3">{g.seconds} seconds · Fictional demo records · English captions</p>
      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <PrepGuideVideo id={g.id} title={g.title} />
        <ol className="space-y-4">{g.steps.map((step, i) => <li key={step.title}><h3 className="font-medium">{i + 1}. {step.title}</h3><p className="mt-1 text-sm leading-6 text-ink-2">{step.description}</p></li>)}</ol>
      </div>
      <Link href={g.openHref} className="text-sm font-medium underline">Open this page</Link>
    </article>)}
  </div>
}
