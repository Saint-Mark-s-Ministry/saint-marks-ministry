import { cn } from '@/lib/utils'

/**
 * The one surface: a 10px-radius card with an optional header row
 * (section title 14/600, description, actions) and an optional toolbar.
 */
export function Panel({
  title,
  description,
  actions,
  toolbar,
  footer,
  children,
  className,
  bodyClassName,
  as: Tag = 'section',
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  toolbar?: React.ReactNode
  footer?: React.ReactNode
  children?: React.ReactNode
  className?: string
  bodyClassName?: string
  as?: 'section' | 'div' | 'aside'
}) {
  return (
    <Tag className={cn('min-w-0 overflow-hidden rounded-lg border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            {title && <h2 className="text-sm leading-5 font-semibold text-ink">{title}</h2>}
            {description && <p className="text-xs text-ink-3">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {toolbar && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">{toolbar}</div>
      )}
      <div className={bodyClassName}>{children}</div>
      {footer && (
        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5 text-[13px] text-ink-3">
          {footer}
        </footer>
      )}
    </Tag>
  )
}

/** Push following toolbar items to the right edge. */
export function ToolbarSpacer() {
  return <div className="ml-auto" />
}
