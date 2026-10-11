import { cn } from '@/lib/utils'

interface EmptyStateProps {
  /** One plain line; say what to do next where there is a next step. */
  message: React.ReactNode
  title?: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ message, title, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-10 text-center', className)}>
      {icon && <div className="mb-1 text-ink-3 [&_svg]:size-6">{icon}</div>}
      {title && <p className="text-sm font-semibold text-ink">{title}</p>}
      <p className="max-w-sm text-[13px] text-ink-3">{message}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
