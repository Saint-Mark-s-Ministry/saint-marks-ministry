'use client'

import Link from 'next/link'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { getPersonInitials } from '@/lib/person-name'
import { cn } from '@/lib/utils'

/**
 * Initials disc; photos when we have one. Accent tint, so it follows the ministry.
 * A photo opens a larger view on tap (pass enlarge={false} where the avatar sits
 * inside another button or link).
 */
export function Initials({
  name,
  imageUrl,
  size = 28,
  className,
  enlarge = true,
}: {
  name?: string | null
  imageUrl?: string | null
  size?: number
  className?: string
  enlarge?: boolean
}) {
  const style = { width: size, height: size, fontSize: size <= 28 ? 11 : 12 }
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    const img = <img src={imageUrl} alt="" style={style} className={cn('shrink-0 rounded-full object-cover', className)} />
    if (!enlarge) return img
    return (
      <PhotoViewer name={name} imageUrl={imageUrl}>
        {img}
      </PhotoViewer>
    )
  }
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-accent-tint font-semibold tracking-[0.02em] text-accent-ink',
        className
      )}
    >
      {getPersonInitials(name)}
    </span>
  )
}

/** Tap a photo to see it large; tap anywhere, press Esc or ✕ to close. */
function PhotoViewer({ name, imageUrl, children }: { name?: string | null; imageUrl: string; children: React.ReactNode }) {
  const label = name ? `${name}'s photo` : 'Photo'
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger
        aria-label={`View ${label}`}
        // Rows and cards are often clickable; the photo shouldn't also trigger them
        onClick={(event) => event.stopPropagation()}
        className="shrink-0 cursor-zoom-in rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
      >
        {children}
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/75 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 duration-200" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-[70] flex w-[min(86vw,360px)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-90 data-[state=closed]:zoom-out-95 duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
        >
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          {/* Tapping the photo closes it too: one gesture to dismiss */}
          <DialogPrimitive.Close className="block w-full cursor-zoom-out rounded-2xl outline-none" aria-label="Close photo">
            {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded photo */}
            <img src={imageUrl} alt={label} className="aspect-square w-full rounded-2xl object-cover shadow-2xl" />
          </DialogPrimitive.Close>
          {name && <p className="text-center text-sm font-medium text-white">{name}</p>}
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute -top-3 -right-3 inline-flex size-9 cursor-pointer items-center justify-center rounded-full bg-surface text-ink shadow-lg hover:bg-hover"
          >
            <X className="size-4" aria-hidden />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** People's names lead every table (research finding 01). */
export function PersonCell({
  name,
  meta,
  href,
  onClick,
  imageUrl,
  className,
}: {
  name: string
  meta?: React.ReactNode
  href?: string
  onClick?: () => void
  imageUrl?: string | null
  className?: string
}) {
  const nameNode = href ? (
    <Link href={href} className="truncate font-medium text-ink no-underline hover:underline">
      {name}
    </Link>
  ) : onClick ? (
    <button type="button" onClick={onClick} className="cursor-pointer truncate text-left font-medium text-ink hover:underline">
      {name}
    </button>
  ) : (
    <span className="truncate font-medium text-ink">{name}</span>
  )
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <Initials name={name} imageUrl={imageUrl} />
      <div className="flex min-w-0 flex-col leading-[1.3]">
        {nameNode}
        {meta && <span className="truncate text-xs text-ink-3">{meta}</span>}
      </div>
    </div>
  )
}
