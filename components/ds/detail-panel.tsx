'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { X } from 'lucide-react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const OpenDetailContext = createContext<RefObject<boolean> | null>(null)

function useIsWide(query = '(min-width: 1280px)') {
  const subscribe = useCallback((notify: () => void) => {
    const mq = window.matchMedia?.(query)
    if (!mq) return () => {}
    mq.addEventListener('change', notify)
    return () => mq.removeEventListener('change', notify)
  }, [query])
  const getSnapshot = useCallback(() => window.matchMedia?.(query).matches ?? false, [query])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

interface DetailPanelProps {
  open: boolean
  /** Remount only the contents when the selected record changes. */
  recordKey?: string
  onClose: () => void
  title: React.ReactNode
  /** Accessible name when `title` is not plain text. */
  label?: string
  header?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
}

/**
 * A record opens beside the list, not in a modal (design principle "Use the
 * width"). At ≥1280px it is a 360px column next to the list; narrower, it
 * opens as a sheet from the right (tablet) or bottom (phone).
 *
 * Place it as the second child of <SplitView>.
 */
export function DetailPanel({ open, recordKey, onClose, title, label, header, footer, children }: DetailPanelProps) {
  const wide = useIsWide()
  const openDetail = useContext(OpenDetailContext)
  // A keyed record may remount while the previous panel is still present.
  // Capture that before its cleanup so replacing a record never expands again.
  const [replacingRecord] = useState(() => openDetail?.current ?? false)
  useEffect(() => {
    if (!open || !openDetail) return
    openDetail.current = true
    return () => { openDetail.current = false }
  }, [open, openDetail])
  if (!open) return null

  const body = (
    <div key={recordKey} className="detail-panel-record-content flex min-h-0 flex-1 flex-col">
      <div className="flex items-start gap-3 border-b border-line px-4 py-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {typeof title === 'string' ? <h2 className="text-[15px] font-semibold text-ink">{title}</h2> : title}
          {header}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close details">
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
      {footer && <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">{footer}</div>}
    </div>
  )

  if (wide) {
    return (
      <aside
        aria-label={label ?? (typeof title === 'string' ? title : 'Details')}
        className={cn(
          'sticky top-[68px] w-[360px] shrink-0 self-start overflow-hidden rounded-lg',
          !replacingRecord && 'detail-panel-desktop'
        )}
      >
        <div className="flex max-h-[calc(100vh-88px)] w-[360px] flex-col overflow-hidden rounded-lg border border-line bg-surface">
          {body}
        </div>
      </aside>
    )
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={cn(
          'fixed inset-0 z-50 bg-[rgba(19,18,17,0.45)]',
          !replacingRecord && 'animate-in fade-in-0 duration-200 motion-reduce:animate-none'
        )} />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed z-50 flex flex-col overflow-hidden border-line bg-surface text-ink',
            'inset-x-0 bottom-0 max-h-[88vh] rounded-t-xl border-t pb-[env(safe-area-inset-bottom)]',
            'md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[400px] md:rounded-none md:border-t-0 md:border-l',
            // Bottom sheet on phones, side sheet on tablets
            !replacingRecord && 'animate-in slide-in-from-bottom duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:slide-in-from-right motion-reduce:animate-none'
          )}
        >
          <DialogPrimitive.Title className="sr-only">{label ?? (typeof title === 'string' ? title : 'Details')}</DialogPrimitive.Title>
          {body}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** List and detail side by side; the list keeps its place (research finding 03). */
export function SplitView({ children, className }: { children: React.ReactNode; className?: string }) {
  const openDetail = useRef(false)
  return (
    <OpenDetailContext.Provider value={openDetail}>
      <div className={cn('flex min-w-0 items-start gap-5', className)}>{children}</div>
    </OpenDetailContext.Provider>
  )
}
