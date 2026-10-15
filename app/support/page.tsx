import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight, ChevronDown, Mail } from 'lucide-react'
import { MinistryPublicPage } from '@/components/ministry-public-page'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: "App Support | Saint Mark's Ministry",
  description: "Contact Saint Mark's Ministry app support for sign-in, account access, attendance records, and privacy questions.",
  alternates: { canonical: 'https://www.stmarkministry.app/support' },
}

const faqs = [
  {
    question: 'How do I get an account?',
    answer: <>Parents and guardians can <Link href="/signup/parent">create a parent account</Link> and submit a child registration. Child access depends on an approved guardian relationship. Sunday School servants can <Link href="/signup/servant">apply to serve</Link>; applications require review. Servants Prep participants can use the <Link href="/registration">program registration form</Link>. Contact your ministry leader if you are unsure which path to use.</>,
  },
  {
    question: 'I forgot my password. What should I do?',
    answer: <>Use <Link href="/forgot-password">Reset password</Link> with the email associated with your account. Check your spam folder for the reset message. If you normally use Google sign-in, use that option on the <Link href="/login">sign-in page</Link>. Contact support if you still cannot get in.</>,
  },
  {
    question: 'Why can’t I see my class, child, or ministry workspace?',
    answer: <>Access depends on your ministry roles, class assignments, and approved guardian or mentor relationships. Signing up does not automatically grant access to records. Ask your ministry leader to check your assignment or registration status, or email support for help.</>,
  },
  {
    question: 'How do I correct an attendance or progress record?',
    answer: <>Ask the servant or leader responsible for your class or program to review the record. For a technical problem, tell support which screen was affected and what happened. Omit private child records, exam answers, and pastoral information from your initial message.</>,
  },
  {
    question: 'How do I manage notifications?',
    answer: <>Where notifications are available, they are optional. You can change permission in your browser or device settings. Check your device’s notification and Focus settings if an expected notification is missing. Availability may differ between the web portal and the mobile app.</>,
  },
  {
    question: 'How do I request account deletion or help with my child’s information?',
    answer: <>Email <a href="mailto:developer@copticchurch.net">developer@copticchurch.net</a> to request account deletion, review or correction of your information, or help with a linked child’s records. We may need to verify your identity or guardianship. The <Link href="/privacy">privacy policy</Link> explains retention and your choices. Do not send identity documents or sensitive records in your initial email.</>,
  },
]

export default function SupportPage() {
  return (
    <MinistryPublicPage currentPage="support">
      <section className="grid gap-8 py-12 md:grid-cols-[1fr_1fr] md:gap-14 md:py-16" aria-labelledby="support-title">
        <div data-reveal>
          <p className="text-xs font-medium tracking-[0.12em] text-accent-ink uppercase">Saint Mark&apos;s Ministry · Support</p>
          <h1 id="support-title" className="mt-4 font-display text-5xl leading-tight font-medium tracking-tight">A little help<br />along the way.</h1>
          <p className="mt-5 max-w-md text-lg leading-8 text-ink-2">Get help with the app, your ministry account, or the web portal.</p>
          <Link href="/login" className="mt-4 inline-flex items-center gap-2 py-3 text-sm font-medium text-accent-ink underline underline-offset-4">Open ministry portal <ArrowUpRight className="size-4" aria-hidden="true" /></Link>
        </div>
        <div data-reveal data-ministry-panel className="rounded-2xl border border-line bg-surface p-6 md:p-8">
          <Mail className="size-6 text-accent-ink" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-medium">Contact app support</h2>
          <a href="mailto:developer@copticchurch.net" className="mt-3 inline-block break-all py-2 text-lg font-medium text-accent-ink underline underline-offset-4">developer@copticchurch.net</a>
          <p className="mt-3 text-sm leading-6 text-ink-2">For a technical issue, include your app version, device and operating system, the affected screen, and a short description of what happened.</p>
          <p className="mt-3 text-sm leading-6 text-ink-3">Keep passwords and sensitive child or ministry records out of your initial message.</p>
          <Button asChild size="lg" className="mt-6"><a href="mailto:developer@copticchurch.net?subject=Saint%20Mark%27s%20Ministry%20support">Email support <Mail aria-hidden="true" /></a></Button>
        </div>
      </section>

      <section data-reveal className="border-t border-line py-10" aria-labelledby="faq-title">
        <h2 id="faq-title" className="font-display text-3xl font-medium">Common questions</h2>
        <div className="mt-6 divide-y divide-line border-y border-line">
          {faqs.map(({ question, answer }) => (
            <details key={question} className="group py-1">
              <summary className="flex cursor-pointer items-center justify-between gap-5 rounded-md py-5 pr-3 text-base font-medium hover:text-accent-ink">{question}<ChevronDown className="size-4 shrink-0 text-ink-3" aria-hidden="true" /></summary>
              <div data-answer className="max-w-3xl pb-5 text-[15px] leading-7 text-ink-2 [&_a]:font-medium [&_a]:text-accent-ink [&_a]:underline [&_a]:underline-offset-4">{answer}</div>
            </details>
          ))}
        </div>
      </section>

      <aside className="max-w-3xl text-sm leading-7 text-ink-3">
        For urgent pastoral or safeguarding concerns, contact clergy or church administration directly. For an emergency, contact emergency services. App support is for account and technical help.
      </aside>
    </MinistryPublicPage>
  )
}
