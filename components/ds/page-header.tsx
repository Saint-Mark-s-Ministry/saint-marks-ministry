import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: React.ReactNode
  /** Short facts under the title, separated by dots ("70 total · 55 active"). */
  meta?: React.ReactNode[] | React.ReactNode
  actions?: React.ReactNode
  back?: { href: string; label?: string }
  className?: string
}

/** Title + meta + actions in one row (design system §07, "Page header"). */
export function PageHeader({ title, meta, actions, back, className }: PageHeaderProps) {
  const metaItems = Array.isArray(meta) ? meta.filter((m) => m !== null && m !== undefined && m !== false) : meta ? [meta] : []
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {back && (
        <Link
          href={back.href}
          className="inline-flex w-fit items-center gap-1 text-[13px] text-ink-2 no-underline hover:text-ink"
        >
          <ChevronLeft className="size-3.5" aria-hidden />
          {back.label ?? 'Back'}
        </Link>
      )}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-[30px] leading-[32px] font-medium tracking-[-0.01em] text-ink md:text-[32px] md:leading-[34px]">
            {title}
          </h1>
          {metaItems.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-3">
              {metaItems.map((item, i) => (
                <span key={i} className="inline-flex items-center gap-2">
                  {i > 0 && <span aria-hidden className="size-[3px] rounded-full bg-ink-3" />}
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
