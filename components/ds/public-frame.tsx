import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * Sign-in, sign-up and other pages outside the app shell: the portal mark,
 * one centered card, and the legal links (design: "Parent, account & public").
 */
export function PublicFrame({
  title,
  description,
  badges,
  children,
  width = 'md',
  className,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  badges?: React.ReactNode
  children: React.ReactNode
  width?: 'md' | 'lg' | 'xl'
  className?: string
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center gap-6 bg-canvas px-4 py-10 md:py-12">
      <Link href="/" className="flex items-center gap-2.5 text-ink no-underline">
        <Image src="/sunday-school-favicon.png" alt="" width={40} height={40} className="size-10 object-contain" />
        <span className="font-display text-xl font-medium">St. Mark Ministry Portal</span>
      </Link>
      <main
        id="main"
        className={cn(
          'flex w-full flex-col gap-[18px] rounded-[16px] border border-line bg-surface p-6 md:p-8',
          width === 'md' ? 'max-w-[440px]' : width === 'lg' ? 'max-w-[480px]' : 'max-w-[640px]',
          className
        )}
      >
        {title && (
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="font-display text-[30px] leading-tight font-medium text-ink">{title}</h1>
            {badges && <div className="flex flex-wrap justify-center gap-1.5">{badges}</div>}
            {description && <p className="max-w-[420px] text-sm leading-relaxed text-ink-3">{description}</p>}
          </div>
        )}
        {children}
      </main>
      <PublicFooter />
    </div>
  )
}

export function PublicFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12.5px] text-ink-3">
      <Link href="/privacy" className="text-ink-3 no-underline hover:text-ink">
        Privacy
      </Link>
      <Link href="/terms" className="text-ink-3 no-underline hover:text-ink">
        Terms
      </Link>
      <span>© {new Date().getFullYear()} St. Mark Coptic Orthodox Church</span>
    </footer>
  )
}

/** Label above control, with an optional required marker. */
export function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string
  htmlFor?: string
  required?: boolean
  hint?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-ink-2">
        {label}
        {required && <span className="text-bad" aria-hidden> *</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  )
}
