import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function LoadingStatus({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn('flex items-center justify-center gap-2.5 text-sm text-ink-3', className)}>
      <LoaderCircle aria-hidden="true" className="size-4 shrink-0 motion-safe:animate-spin" />
      <span>{label}</span>
    </div>
  )
}
