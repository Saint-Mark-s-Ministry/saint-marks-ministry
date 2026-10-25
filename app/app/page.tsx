import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, BookOpen, GraduationCap, ShieldCheck } from 'lucide-react'
import { MinistryPublicPage } from '@/components/ministry-public-page'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: "Saint Mark's Ministry | Sunday School & Servants Prep",
  description: 'A shared home for Sunday School and Servants Preparation at the Coptic Orthodox Church of Saint Mark in Jersey City.',
  alternates: { canonical: 'https://www.stmarkministry.app/app' },
}

const ministries = [
  {
    number: '01',
    title: 'Sunday School',
    icon: BookOpen,
    description: 'Support the children, families, and servants in your class. Keep the week’s lessons and ministry records together.',
    features: ['Class rosters and attendance', 'Weekly lessons and resources', 'Parent registration and family access'],
  },
  {
    number: '02',
    title: 'Servants Preparation',
    icon: GraduationCap,
    description: 'Stay connected through the two-year preparation program, with a clear view of learning, service, and progress.',
    features: ['Curriculum and lesson calendars', 'Attendance, exams, and program progress', 'Mentoring and serving requirements'],
  },
]

export default function MinistryAppPage() {
  return (
    <MinistryPublicPage currentPage="app">
      <section className="grid items-center gap-10 py-14 md:grid-cols-[1.3fr_1fr] md:gap-16 md:py-20" aria-labelledby="app-title">
        <div data-reveal>
          <p className="text-xs font-medium tracking-[0.12em] text-accent-ink uppercase">St. Mark Church · Jersey City</p>
          <h1 id="app-title" className="mt-5 max-w-xl font-display text-5xl leading-[1.06] font-medium tracking-tight md:text-6xl">
            Stay connected<br />to your ministry.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-ink-2">
            Saint Mark&apos;s Ministry brings Sunday School and Servants Preparation into one place for our church community.
          </p>
          <p className="mt-3 max-w-lg text-[15px] leading-7 text-ink-3">
            Access the lessons, attendance, calendars, and progress information available to your ministry role.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link href="/login">Open ministry portal <ArrowRight data-arrow aria-hidden="true" /></Link></Button>
            <Button asChild variant="outline" size="lg"><Link href="/support">Get support</Link></Button>
          </div>
          <p className="mt-4 text-sm text-ink-3">The iOS app is being prepared for release. Use the web portal today.</p>
        </div>
        <div data-reveal data-ministry-mark className="flex flex-col items-center rounded-[24px] border border-line bg-surface px-8 py-10 text-center md:py-14">
          <div className="flex size-40 items-center justify-center rounded-full border border-line bg-[#FAF8F6]">
            <Image src="/st-mark-logo.png" alt="St. Mark Coptic Orthodox Church" width={112} height={112} className="size-28 object-contain" priority />
          </div>
          <p className="mt-7 font-display text-3xl font-medium">One church.<br />Two ministries.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-ink-2">
            <span className="rounded-full border border-line px-3 py-2">Sunday School</span>
            <span className="rounded-full border border-line px-3 py-2">Servants Prep</span>
          </div>
        </div>
      </section>

      <section data-reveal aria-labelledby="ministries-title" className="border-t border-line py-10 md:py-14">
        <h2 id="ministries-title" className="font-display text-3xl font-medium">The work of ministry, in one place.</h2>
        <div className="mt-8 divide-y divide-line">
          {ministries.map(({ number, title, icon: Icon, description, features }) => (
            <div data-reveal key={number} className="grid gap-6 py-8 first:pt-0 last:pb-0 md:grid-cols-[60px_1fr_1fr] md:gap-8">
              <span className="font-display text-3xl text-ink-3" aria-hidden="true">{number}</span>
              <div>
                <h3 className="flex items-center gap-3 text-xl font-medium"><Icon className="size-5 text-accent-ink" aria-hidden="true" />{title}</h3>
                <p className="mt-3 max-w-md text-[15px] leading-7 text-ink-2">{description}</p>
              </div>
              <ul className="flex flex-col gap-3 text-[15px] text-ink-2">
                {features.map(feature => <li key={feature} className="flex items-start gap-3"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />{feature}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section data-reveal data-ministry-panel aria-labelledby="access-title" className="grid gap-8 rounded-2xl border border-line bg-surface p-6 md:grid-cols-2 md:p-9">
        <div>
          <ShieldCheck className="size-6 text-accent-ink" aria-hidden="true" />
          <h2 id="access-title" className="mt-4 font-display text-3xl font-medium">Your ministry. Your access.</h2>
          <p className="mt-3 text-[15px] leading-7 text-ink-2">Accounts, ministry roles, and approved relationships determine which records you can see. Signing up does not automatically grant access to church records.</p>
          <Link href="/privacy" className="mt-4 inline-block py-2 text-sm font-medium text-accent-ink underline underline-offset-4">Read our privacy policy</Link>
        </div>
        <div>
          <h3 className="text-lg font-medium">Getting started</h3>
          <p className="mt-3 text-[15px] leading-7 text-ink-2">Already have a ministry account? Sign in with your existing credentials. New to the portal? Choose the path that fits your church involvement.</p>
          <div className="mt-4 flex flex-col items-start gap-1 text-sm">
            <Link href="/signup/parent" className="py-2 font-medium text-accent-ink underline underline-offset-4">Register as a parent or guardian</Link>
            <Link href="/signup/servant" className="py-2 font-medium text-accent-ink underline underline-offset-4">Apply to serve in Sunday School</Link>
            <Link href="/registration" className="py-2 font-medium text-accent-ink underline underline-offset-4">Apply for Servants Preparation</Link>
          </div>
        </div>
      </section>
    </MinistryPublicPage>
  )
}
