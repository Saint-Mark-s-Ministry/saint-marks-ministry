'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { Segmented } from '@/components/ds/segmented'
import { SearchField } from '@/components/ds/search-field'
import { StatusBadge } from '@/components/ds/status-badge'
import { DetailPanel, SplitView } from '@/components/ds/detail-panel'
import { KeyValueList } from '@/components/ds/kv-list'
import {
  auditActionSummary,
  auditEntityLabel,
  auditMetadataEntries,
  auditReasonLabel,
  auditTargetLabel,
} from '@/lib/audit-display'

type AuditResult = 'SUCCESS' | 'DENIED' | 'FAILED'

interface AuditEventRow {
  id: string
  action: string
  entityType: string
  entityId: string | null
  result: AuditResult
  reason: string | null
  metadata: unknown
  createdAt: string
  actor: { id: string; name: string | null; email: string } | null
  target: { id: string; name: string | null; email: string } | null
}

interface AuditResponse {
  events: AuditEventRow[]
  page: number
  total: number
  totalPages: number
  retention: { hours: number; maxEvents: number }
}

const RESULT_META: Record<AuditResult, { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  SUCCESS: { label: 'Successful', tone: 'ok' },
  DENIED: { label: 'Denied', tone: 'warn' },
  FAILED: { label: 'Failed', tone: 'bad' },
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function ActivityPage() {
  const [data, setData] = useState<AuditResponse | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [result, setResult] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const loadEvents = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (search) params.set('search', search)
      if (result) params.set('result', result)
      const response = await fetch(`/api/admin/audit-log?${params}`)
      if (!response.ok) throw new Error('Unable to load activity')
      setData(await response.json())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load activity')
    } finally {
      setLoading(false)
    }
  }, [page, result, search])

  useEffect(() => { void loadEvents() }, [loadEvents])

  // Search as you type, after a short pause.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1)
      setSearch(searchInput.trim())
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const selected = data?.events.find((e) => e.id === selectedId) ?? null

  return (
    <div className="content-reveal flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Activity log"
        meta={['Security and administrative activity recorded across the website']}
        actions={
          <Button variant="outline" onClick={() => void loadEvents()}>
            <RefreshCw />
            Refresh
          </Button>
        }
      />

      <SplitView>
        <Panel
          className="flex-1"
          toolbar={
            <>
              <Segmented
                label="Result"
                value={result || 'all'}
                onChange={(v) => {
                  setPage(1)
                  setResult(v === 'all' ? '' : v)
                }}
                options={[
                  { value: 'all', label: 'All results' },
                  { value: 'SUCCESS', label: 'Successful' },
                  { value: 'DENIED', label: 'Denied' },
                  { value: 'FAILED', label: 'Failed' },
                ]}
              />
              <SearchField value={searchInput} onChange={setSearchInput} placeholder="Search user, action, or record" label="Search activity" className="md:ml-auto md:w-[260px]" />
            </>
          }
          footer={
            data && (
              <>
                <span>
                  {data.total} event{data.total === 1 ? '' : 's'} · kept up to {data.retention.hours} hours (max{' '}
                  {data.retention.maxEvents.toLocaleString()})
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>Previous</Button>
                  <span className="tabular">Page {data.page} of {data.totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((v) => v + 1)}>Next</Button>
                </span>
              </>
            )
          }
        >
          {error && <p role="alert" className="m-3 rounded-md bg-bad-tint px-3 py-2 text-[13px] text-bad">{error}</p>}
          {loading ? (
            <EmptyState message="Loading activity…" />
          ) : data?.events.length ? (
            <ul className="divide-y divide-line">
              {data.events.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(event.id)}
                    className={`grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-2.5 text-left md:grid-cols-[120px_160px_minmax(0,1fr)_96px] ${selectedId === event.id ? 'bg-accent-tint' : 'hover:bg-hover/60'}`}
                  >
                    <time className="tabular order-3 text-xs text-ink-3 md:order-none md:text-[13px]" dateTime={event.createdAt}>
                      {when(event.createdAt)}
                    </time>
                    <span className="order-1 truncate text-[13px] font-medium text-ink md:order-none">{event.actor?.name ?? event.actor?.email ?? 'System'}</span>
                    <span className="order-4 col-span-2 flex min-w-0 flex-col md:order-none md:col-span-1">
                      <span className="truncate text-[13px] text-ink">{auditActionSummary(event)}</span>
                      <span className="truncate text-xs text-ink-3">
                        {auditEntityLabel(event.entityType)} · {auditTargetLabel(event)}
                      </span>
                    </span>
                    <span className="order-2 justify-self-end md:order-none md:justify-self-start">
                      <StatusBadge tone={RESULT_META[event.result].tone}>{RESULT_META[event.result].label}</StatusBadge>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState message="No activity matches these filters." />
          )}
        </Panel>

        {selected && (
          <DetailPanel open onClose={() => setSelectedId(null)} title={auditActionSummary(selected)}>
            <KeyValueList
              items={[
                { label: 'Result', value: <StatusBadge tone={RESULT_META[selected.result].tone}>{RESULT_META[selected.result].label}</StatusBadge> },
                { label: 'User', value: selected.actor ? `${selected.actor.name ?? ''}${selected.actor.name ? ' · ' : ''}${selected.actor.email}` : 'System' },
                { label: 'When', value: new Date(selected.createdAt).toLocaleString() },
                { label: 'Affected record', value: `${auditEntityLabel(selected.entityType)} · ${auditTargetLabel(selected)}` },
                ...(auditReasonLabel(selected.reason) ? [{ label: 'Explanation', value: auditReasonLabel(selected.reason) }] : []),
                ...(selected.entityId ? [{ label: 'Record ID', value: <span className="font-mono text-xs break-all">{selected.entityId}</span> }] : []),
                ...auditMetadataEntries(selected.metadata).map((entry) => ({ label: entry.label, value: entry.value })),
              ]}
            />
          </DetailPanel>
        )}
      </SplitView>
    </div>
  )
}
