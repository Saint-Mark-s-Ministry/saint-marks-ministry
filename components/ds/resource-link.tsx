'use client'

import { useState } from 'react'
import { ExternalLink, FileText, Link2, Presentation, Video } from 'lucide-react'
import {
  extractDomain,
  extractGoogleDriveFileId,
  getGoogleDriveThumbnail,
  isGoogleDriveLink,
} from '@/lib/link-metadata'
import { cn } from '@/lib/utils'

function iconFor(url: string, type?: string | null) {
  const hint = `${type ?? ''} ${url}`.toLowerCase()
  if (/video|youtube|youtu\.be|vimeo|\.mp4/.test(hint)) return Video
  if (/presentation|slides|\.ppt/.test(hint)) return Presentation
  if (/document|\.pdf|\.doc|drive\.google/.test(hint)) return FileText
  return Link2
}

/** A lesson resource: Drive thumbnail when there is one, else a type icon. */
export function ResourceLink({
  title,
  url,
  type,
  compact = false,
  className,
}: {
  title: string
  url: string
  type?: string | null
  compact?: boolean
  className?: string
}) {
  const fileId = isGoogleDriveLink(url) ? extractGoogleDriveFileId(url) : null
  const [thumbFailed, setThumbFailed] = useState(false)
  const Icon = iconFor(url, type)
  const size = compact ? 'size-8' : 'size-11'

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group flex min-h-11 items-center gap-3 rounded-md border border-line px-2.5 py-2 text-ink no-underline transition-colors hover:bg-hover/60',
        className
      )}
    >
      <span className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-hover text-ink-3', size)}>
        {fileId && !thumbFailed ? (
          // eslint-disable-next-line @next/next/no-img-element -- Google Drive thumbnail with an icon fallback
          <img src={getGoogleDriveThumbnail(fileId)} alt="" className="size-full object-cover" onError={() => setThumbFailed(true)} />
        ) : (
          <Icon className="size-4" aria-hidden />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-medium">{title}</span>
        <span className="truncate text-xs text-ink-3">{extractDomain(url)}</span>
      </span>
      <ExternalLink className="size-3.5 shrink-0 text-ink-3 group-hover:text-ink" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  )
}
