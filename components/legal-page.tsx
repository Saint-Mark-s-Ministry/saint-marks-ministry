import type { ReactNode } from 'react'
import { LegalHeader } from '@/components/legal-header'
import { LegalBackLink } from '@/components/legal-back-link'
import { PublicFooter } from '@/components/ds/public-frame'

interface LegalSection {
  title: string
  content: ReactNode
}

interface LegalPageProps {
  eyebrow: 'Privacy' | 'Terms'
  title: string
  description: string
  lastUpdated: string
  sections: LegalSection[]
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

/** Privacy and Terms: a table of contents beside numbered sections (design: "Privacy Policy · Terms"). */
export function LegalPage({ eyebrow, title, description, lastUpdated, sections }: LegalPageProps) {
  return (
    <div className="min-h-full bg-canvas text-ink">
      <LegalHeader />

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-8 md:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-12">
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-20 flex flex-col gap-1">
            <p className="mb-1 px-2.5 text-[11px] font-medium tracking-[0.06em] text-ink-3 uppercase">On this page</p>
            {sections.map((section) => (
              <a
                key={section.title}
                href={`#${slug(section.title)}`}
                className="rounded-md px-2.5 py-1.5 text-[13px] leading-snug text-ink-2 no-underline hover:bg-hover hover:text-ink"
              >
                {section.title}
              </a>
            ))}
          </div>
        </nav>

        <main id="main" className="min-w-0 max-w-3xl">
          <LegalBackLink />
          <p className="text-xs font-medium tracking-[0.06em] text-accent-ink uppercase">
            St. Mark Church Ministry Portal · {eyebrow}
          </p>
          <h1 className="mt-2 font-display text-[38px] leading-tight font-medium tracking-[-0.01em] md:text-[44px]">{title}</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-ink-2">{description}</p>
          <p className="mt-2 text-[13px] text-ink-3">Last updated {lastUpdated}</p>

          <article className="mt-10 flex flex-col gap-10">
            {sections.map((section, index) => (
              <section key={section.title} id={slug(section.title)} className="scroll-mt-20">
                <h2 className="text-lg font-semibold tracking-tight">
                  {index + 1}. {section.title}
                </h2>
                <div className="mt-3 space-y-3 text-[15px] leading-7 text-ink-2 [&_a]:text-accent-ink [&_li]:ml-5 [&_ul]:list-disc">
                  {section.content}
                </div>
              </section>
            ))}
          </article>

          <div className="mt-14 border-t border-line pt-6">
            <PublicFooter />
          </div>
        </main>
      </div>
    </div>
  )
}
