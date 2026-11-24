'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { ExternalLink, FileText } from 'lucide-react'
import { Panel } from '@/components/ds/panel'
import { StatusBadge, type Tone } from '@/components/ds/status-badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { TableSkeleton } from '@/components/ui/skeleton'
import { formatToastTimestamp } from '@/lib/utils'
import {
  CONFESSION_SLIP_TEMPLATE_URL,
  canStudentUploadConfessionSlip,
  formatConfessionPeriod,
  getConfessionPeriodStatus,
  getConfessionPeriods,
  type ConfessionPeriod,
  type ConfessionPeriodStatus,
} from '@/lib/confession'
import { uploadSlip, useMyConfessionSlips, type MyConfessionSlip, type MyConfessionSlips } from '@/lib/slips-client'

const STATUS: Record<ConfessionPeriodStatus, { label: string; tone: Tone }> = {
  slip: { label: 'Received', tone: 'ok' },
  registration: { label: 'Covered by registration', tone: 'info' },
  missing: { label: 'Missed', tone: 'bad' },
  due: { label: 'Due now', tone: 'warn' },
  upcoming: { label: 'Upcoming', tone: 'neutral' },
  na: { label: 'Before you joined', tone: 'neutral' },
}

export interface MyConfessionPeriod {
  period: ConfessionPeriod
  status: ConfessionPeriodStatus
  slip?: MyConfessionSlip
  canUpload: boolean
  isCurrent: boolean
}

/** The active year's periods, each with its status and what the student may do. */
export function myConfessionPeriods(data: MyConfessionSlips | undefined, now = new Date()): MyConfessionPeriod[] {
  if (!data?.year || !data.studentStart) return []
  const start = new Date(data.studentStart)
  const slipByPeriod = new Map(data.slips.map(s => [new Date(s.periodStart).getTime(), s]))
  return getConfessionPeriods(data.year).map(period => {
    const slip = slipByPeriod.get(period.start.getTime())
    const open = canStudentUploadConfessionSlip(getConfessionPeriodStatus(period, start, false, now))
    return {
      period,
      slip,
      status: getConfessionPeriodStatus(period, start, !!slip, now),
      // A slip a servant recorded is final from the student's side.
      canUpload: open && (!slip || slip.uploadedByMe),
      isCurrent: period.start <= now && now < period.end,
    }
  })
}

/** Opens the blank slip (read-only Google Doc preview) in a new tab. */
export function ConfessionSlipTemplateLink({ size = 'default', variant = 'outline' }: { size?: 'default' | 'sm'; variant?: 'outline' | 'default' }) {
  return (
    <Button asChild size={size} variant={variant}>
      <a href={CONFESSION_SLIP_TEMPLATE_URL} target="_blank" rel="noopener noreferrer">
        <FileText />
        View blank slip
        <ExternalLink className="size-3.5 opacity-70" aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </Button>
  )
}

export function StudentConfessionSlips() {
  const { data, error, mutate } = useMyConfessionSlips()
  const [busy, setBusy] = useState<string | null>(null)

  const handleUpload = async (period: ConfessionPeriod, file: File | undefined) => {
    if (!file) return
    const key = period.start.toISOString()
    setBusy(key)
    try {
      await uploadSlip(file, { periodStart: key }, '/api/slips/mine')
      toast.success('Confession slip uploaded', { description: formatConfessionPeriod(period) })
      await mutate()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(null)
    }
  }

  const howTo = (
    <Panel
      title="Confession slip"
      description="Confess at least once every two months"
      actions={<ConfessionSlipTemplateLink size="sm" />}
    >
      <ol className="flex list-decimal flex-col gap-1 py-3 pr-4 pl-9 text-[13px] text-ink-2">
        <li>Open the blank slip and print it.</li>
        <li>After confession, ask your father of confession to sign it.</li>
        <li>Upload a clear photo or PDF of the signed slip for that period below.</li>
      </ol>
    </Panel>
  )

  if (error) {
    return <div className="flex flex-col gap-5">{howTo}<Panel><EmptyState message="Couldn’t load your confession slips. Refresh to try again." /></Panel></div>
  }
  if (!data) return <div className="flex flex-col gap-5">{howTo}<Panel><TableSkeleton /></Panel></div>

  const rows = myConfessionPeriods(data)

  return (
    <div className="flex flex-col gap-5">
      {howTo}
      <Panel title="Your periods" description={data.year ? data.year.name.replace('-', '–') : undefined}>
        {!data.enrolled ? (
          <EmptyState message="You need an active Servants Prep enrollment to upload confession slips." />
        ) : rows.length === 0 ? (
          <EmptyState message="There’s no active academic year yet." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(({ period, status, slip, canUpload, isCurrent }) => {
              const key = period.start.toISOString()
              const label = formatConfessionPeriod(period)
              return (
                <li key={key} className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 ${isCurrent ? 'bg-accent-tint/50' : ''}`}>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[13.5px] font-medium text-ink">
                      {label}
                      {isCurrent && <span className="ml-1.5 text-xs font-semibold text-accent-ink">· now</span>}
                    </span>
                    {slip && (
                      <span className="text-xs text-ink-3">
                        Uploaded {formatToastTimestamp(new Date(slip.createdAt))}
                        {!slip.uploadedByMe && ' by a servant'}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={STATUS[status].tone}>{STATUS[status].label}</StatusBadge>
                    {slip && (
                      <Button asChild variant="ghost" size="sm">
                        <a href={slip.imageUrl} target="_blank" rel="noopener noreferrer" aria-label={`View your ${label} slip`}>View</a>
                      </Button>
                    )}
                    {canUpload && (
                      <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-line-strong px-3 text-[13px] font-medium md:h-[30px] md:text-[12.5px] text-ink hover:bg-hover focus-within:outline-2 focus-within:outline-accent-ink has-[:disabled]:cursor-default has-[:disabled]:opacity-60">
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          className="sr-only"
                          disabled={busy !== null}
                          aria-label={`${slip ? 'Replace' : 'Upload'} your ${label} slip`}
                          onChange={(ev) => {
                            const file = ev.target.files?.[0]
                            ev.target.value = ''
                            handleUpload(period, file)
                          }}
                        />
                        {busy === key ? 'Uploading…' : slip ? 'Replace' : 'Upload slip'}
                      </label>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </div>
  )
}
