import { cn } from '@/lib/utils'

/** Label / value facts, as in the Students detail panel. */
export function KeyValueList({
  items,
  className,
}: {
  items: { label: string; value: React.ReactNode }[]
  className?: string
}) {
  return (
    <dl className={cn('flex flex-col divide-y divide-line', className)}>
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-2.5 text-[13px]">
          <dt className="text-ink-3">{item.label}</dt>
          <dd className="min-w-0 break-words text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
