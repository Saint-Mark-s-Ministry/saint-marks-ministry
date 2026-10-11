'use client'

import { useState } from 'react'
import { ContactLink } from '@/components/contact-link'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle, Eye, Loader2, XCircle } from 'lucide-react'
import { RegistrationStatus } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/empty-state'
import { PageLoading } from '@/components/ui/page-loading'
import { LoadingStatus } from '@/components/ui/loading-status'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { Segmented } from '@/components/ds/segmented'
import { SearchField } from '@/components/ds/search-field'
import { StatusBadge } from '@/components/ds/status-badge'
import { PersonCell } from '@/components/ds/person'
import { DetailPanel, SplitView } from '@/components/ds/detail-panel'
import { KeyValueList } from '@/components/ds/kv-list'
import { canReviewServantApplications } from '@/lib/roles'
import { compareServantApplicationPriority } from '@/lib/servant-applications'
import { useServantApplications } from '@/lib/swr'

interface ServantApplication {
  id: string
  status: RegistrationStatus
  email: string
  fullName: string
  phone: string
  currentGrade: string | null
  createdAt: string
  reviewer: { name: string } | null
  reviewNote: string | null
  reviewedAt: string | null
}

const STATUS_META: Record<RegistrationStatus, { label: string; tone: 'warn' | 'ok' | 'bad' }> = {
  PENDING: { label: 'Pending', tone: 'warn' },
  APPROVED: { label: 'Approved', tone: 'ok' },
  REJECTED: { label: 'Rejected', tone: 'bad' },
  CHANGES_REQUESTED: { label: 'Changes requested', tone: 'warn' },
}

const fmt = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export default function ServantApplicationsPage() {
  const { data: session, status } = useSession()
  const { data: applications, isLoading, error, mutate } = useServantApplications()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<RegistrationStatus | 'all'>('PENDING')
  const [search, setSearch] = useState('')

  if (status === 'loading') return <PageLoading />
  if (!session?.user || !canReviewServantApplications(session.user.role)) {
    redirect('/dashboard')
  }

  const all = [...((applications as ServantApplication[] | undefined) ?? [])].sort(compareServantApplicationPriority)
  const count = (s: RegistrationStatus) => all.filter((a) => a.status === s).length
  const visible = all.filter(
    (a) => (view === 'all' || a.status === view) && (!search || `${a.fullName} ${a.email}`.toLowerCase().includes(search.toLowerCase()))
  )
  const selected = all.find((a) => a.id === selectedId) ?? null

  return (
    <div className="content-reveal flex min-w-0 flex-col gap-5">
      <PageHeader title="Servant applications" meta={['Review Sunday School servant sign-up applications']} />

      <SplitView>
        <Panel
          className="flex-1"
          toolbar={
            <>
              <Segmented
                label="Application status"
                value={view}
                onChange={setView}
                options={[
                  { value: 'PENDING', label: 'Pending', count: count('PENDING') },
                  { value: 'APPROVED', label: 'Approved', count: count('APPROVED') },
                  { value: 'REJECTED', label: 'Rejected', count: count('REJECTED') },
                  { value: 'all', label: 'All', count: all.length },
                ]}
              />
              <SearchField value={search} onChange={setSearch} placeholder="Search applicants" className="md:ml-auto" />
            </>
          }
          footer={<span className="tabular">{visible.length} application{visible.length === 1 ? "" : "s"}</span>}
        >
          {error ? (
            <EmptyState
              title="Couldn’t load applications"
              message="Please try again."
              action={<Button variant="outline" onClick={() => void mutate()}>Try again</Button>}
            />
          ) : isLoading ? (
            <LoadingStatus label="Loading applications…" className="py-8" />
          ) : visible.length === 0 ? (
            <EmptyState message={view === 'PENDING' && !search ? 'Nothing waiting for review.' : 'No applications match.'} />
          ) : (
            <ul className="divide-y divide-line">
              {visible.map((a) => (
                <li
                  key={a.id}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 ${selectedId === a.id ? 'bg-accent-tint' : ''}`}
                >
                  <PersonCell className="min-w-48 flex-1" name={a.fullName} meta={a.email} onClick={() => setSelectedId(a.id)} />
                  <span className="w-28 text-[13px] text-ink-2">{a.currentGrade || '—'}</span>
                  <span className="w-28 text-[13px] text-ink-3">{fmt(a.createdAt)}</span>
                  <span className="w-24">
                    <StatusBadge tone={STATUS_META[a.status].tone}>{STATUS_META[a.status].label}</StatusBadge>
                  </span>
                  <Button variant="outline" size="sm" className="w-24" onClick={() => setSelectedId(a.id)}>
                    <Eye />
                    {a.status === 'PENDING' ? 'Review' : 'View'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {selected && <ApplicationDetail key={selected.id} application={selected} onClose={() => setSelectedId(null)} onUpdate={() => mutate()} />}
      </SplitView>
    </div>
  )
}

function ApplicationDetail({
  application,
  onClose,
  onUpdate,
}: {
  application: ServantApplication
  onClose: () => void
  onUpdate: () => void
}) {
  const [isApproving, setIsApproving] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [note, setNote] = useState('')
  const canReview = application.status === 'PENDING'

  const review = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && !note.trim()) {
      toast.error('Please provide a reason for rejection')
      return
    }
    const setBusy = action === 'approve' ? setIsApproving : setIsRejecting
    setBusy(true)
    try {
      const res = await fetch(`/api/servant-applications/${application.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || `Failed to ${action}`)
      }
      if (action === 'approve') {
        const data = await res.json()
        toast.success('Application approved', {
          description: `A set-password link is being emailed to them. If they don’t receive it, share this temporary password: ${data.tempPassword}`,
          duration: 10000,
        })
      } else {
        toast.success('Application rejected')
      }
      onUpdate()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${action} application`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <DetailPanel
      open
      onClose={onClose}
      label={`Servant application from ${application.fullName}`}
      title={
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold text-ink">Servant application</h2>
          <p className="flex items-center gap-2 text-xs text-ink-3">
            {application.fullName}
            <StatusBadge tone={STATUS_META[application.status].tone}>{STATUS_META[application.status].label}</StatusBadge>
          </p>
        </div>
      }
      footer={
        canReview && (
          <>
            <Button variant="destructive" className="flex-1" onClick={() => review('reject')} disabled={isApproving || isRejecting}>
              {isRejecting ? <Loader2 className="animate-spin" /> : <XCircle />}
              Reject
            </Button>
            <Button className="flex-1" onClick={() => review('approve')} disabled={isApproving || isRejecting}>
              {isApproving ? <Loader2 className="animate-spin" /> : <CheckCircle />}
              Approve
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-3">
        <KeyValueList
          items={[
            { label: 'Name', value: application.fullName },
            { label: 'Email', value: <ContactLink kind="email" value={application.email} name={application.fullName} label="applicant email" /> },
            { label: 'Phone', value: <ContactLink kind="phone" value={application.phone} name={application.fullName} label="applicant phone number" className="font-mono text-xs" /> },
            { label: 'Grade served', value: application.currentGrade || <span className="text-ink-3">Not provided</span> },
            { label: 'Submitted', value: fmt(application.createdAt) },
          ]}
        />
        {canReview ? (
          <>
            <p className="rounded-md bg-info-tint px-3 py-2 text-[13px] text-info">
              <strong>Approving creates a Sunday School servant account</strong> and emails the applicant a link to set their
              password.
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="reviewNote">Review note</Label>
              <Textarea id="reviewNote" placeholder="Optional for approval, required for rejection" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </>
        ) : (
          <KeyValueList
            items={[
              { label: 'Reviewed by', value: application.reviewer?.name ?? '—' },
              { label: 'Reviewed', value: application.reviewedAt ? new Date(application.reviewedAt).toLocaleString() : '—' },
              ...(application.reviewNote ? [{ label: 'Note', value: application.reviewNote }] : []),
            ]}
          />
        )}
      </div>
    </DetailPanel>
  )
}
