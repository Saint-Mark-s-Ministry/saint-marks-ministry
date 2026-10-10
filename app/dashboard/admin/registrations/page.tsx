'use client'

import { useState } from 'react'
import { ContactLink } from '@/components/contact-link'
import { useSession } from 'next-auth/react'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { PageLoading } from '@/components/ui/page-loading'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { canViewRegistrations, canManageInviteCodes, canReviewRegistrations } from '@/lib/roles'
import { useInviteCodes, useRegistrationSubmissions, useRegistrationSettings } from '@/lib/swr'
import { Copy, Plus, Eye, CheckCircle, XCircle, Loader2, Power, PowerOff, Trash2, Ban, RefreshCw, Link2 } from 'lucide-react'
import { RegistrationStatus, YearLevel, Prisma } from '@prisma/client'

type RegistrationSubmission = Prisma.RegistrationSubmissionGetPayload<{
  include: {
    inviteCode: { select: { code: true; label: true } }
    reviewer: { select: { id: true; name: true; email: true } }
    createdUser: { select: { id: true; name: true; email: true } }
  }
}> & { reviewNote?: string | null }

type InviteCode = Prisma.InviteCodeGetPayload<{
  include: {
    creator: { select: { id: true; name: true; email: true } }
    _count: { select: { registrations: true } }
  }
}>
import { getGradeDisplayName } from '@/lib/registration-utils'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { Segmented } from '@/components/ds/segmented'
import { SearchField } from '@/components/ds/search-field'
import { StatusBadge } from '@/components/ds/status-badge'
import { PersonCell } from '@/components/ds/person'
import { DetailPanel, SplitView } from '@/components/ds/detail-panel'
import { KeyValueList } from '@/components/ds/kv-list'
import { EmptyState } from '@/components/ui/empty-state'

export default function RegistrationsPage() {
  // useAdminGuard waits for the session before deciding; redirecting during
  // render bounced direct visits to /dashboard while the session was loading.
  const { session, status } = useAdminGuard(canViewRegistrations)
  const [activeTab, setActiveTab] = useState('submissions')

  if (status === 'loading' || !session?.user || !canViewRegistrations(session.user.role)) {
    return <PageLoading />
  }

  return (
    <div className="content-reveal flex min-w-0 flex-col">
      <div className="space-y-5">
        <PageHeader
          title="Registrations"
          meta={['Review student applications and manage invite codes']}
          actions={
            <Button
              variant="outline"
              onClick={() => {
                const url = `${window.location.origin}/registration`
                navigator.clipboard.writeText(url)
                toast.success('Registration link copied', { description: url })
              }}
            >
              <Link2 />
              Copy registration link
            </Button>
          }
        />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="submissions">Submissions</TabsTrigger>
          {canManageInviteCodes(session.user.role) && (
            <TabsTrigger value="invite-codes">Invite codes</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="submissions" className="mt-4">
          <SubmissionsTab />
        </TabsContent>

        {canManageInviteCodes(session.user.role) && (
          <TabsContent value="invite-codes" className="mt-4">
            <InviteCodesTab />
          </TabsContent>
        )}
      </Tabs>
      </div>
    </div>
  )
}

const STATUS_META: Record<RegistrationStatus, { label: string; tone: 'warn' | 'ok' | 'bad' }> = {
  PENDING: { label: 'Pending', tone: 'warn' },
  APPROVED: { label: 'Approved', tone: 'ok' },
  REJECTED: { label: 'Rejected', tone: 'bad' },
}

function SubmissionsTab() {
  const { data: session } = useSession()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: submissionsData, mutate } = useRegistrationSubmissions(
    statusFilter !== 'all' ? { status: statusFilter } : undefined
  )

  const submissions: RegistrationSubmission[] = submissionsData?.submissions || []
  const pagination = submissionsData?.pagination
  const visible = submissions.filter(
    (s) => !search || `${s.fullName} ${s.email}`.toLowerCase().includes(search.toLowerCase())
  )
  const selected = submissions.find((s) => s.id === selectedId) ?? null
  const canDelete = session?.user && canReviewRegistrations(session.user.role)

  const handleDeleteSubmission = async (submissionId: string) => {
    try {
      const res = await fetch(`/api/registration/submissions/${submissionId}`, { method: 'DELETE' })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete submission')
      }
      toast.success('Submission deleted')
      if (selectedId === submissionId) setSelectedId(null)
      mutate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete submission')
    }
  }

  const deleteButton = (submission: RegistrationSubmission) => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Delete submission from ${submission.fullName}`} className="hover:text-bad">
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this submission?</AlertDialogTitle>
          <AlertDialogDescription>
            The application from <strong>{submission.fullName}</strong> will be removed. This can’t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => handleDeleteSubmission(submission.id)} className="bg-bad text-white hover:bg-bad/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return (
    <SplitView>
      <Panel
        className="flex-1"
        toolbar={
          <>
            <Segmented
              label="Submission status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: RegistrationStatus.PENDING, label: 'Pending' },
                { value: RegistrationStatus.APPROVED, label: 'Approved' },
                { value: RegistrationStatus.REJECTED, label: 'Rejected' },
              ]}
            />
            <SearchField value={search} onChange={setSearch} placeholder="Search applicants" className="md:ml-auto" />
          </>
        }
        footer={
          pagination && pagination.totalPages > 1 ? (
            <span>
              Page {pagination.page} of {pagination.totalPages}
            </span>
          ) : (
            <span className="tabular">{visible.length} submissions</span>
          )
        }
      >
        {visible.length === 0 ? (
          <EmptyState message={statusFilter === 'all' && !search ? 'No applications yet. Share the registration link to start receiving them.' : 'No submissions match.'} />
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((submission) => (
              <li
                key={submission.id}
                className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 ${selectedId === submission.id ? 'bg-accent-tint' : ''}`}
              >
                <PersonCell
                  className="min-w-48 flex-1"
                  name={submission.fullName}
                  meta={submission.email}
                  imageUrl={submission.profileImageUrl}
                  onClick={() => setSelectedId(submission.id)}
                />
                <span className="w-28 text-[13px] text-ink-2">{getGradeDisplayName(submission.grade)}</span>
                <span className="w-28 text-[13px] text-ink-3">
                  {new Date(submission.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <span className="w-24">
                  <StatusBadge tone={STATUS_META[submission.status].tone}>{STATUS_META[submission.status].label}</StatusBadge>
                </span>
                <span className="flex w-32 items-center justify-end gap-1">
                  <Button variant="outline" size="sm" onClick={() => setSelectedId(submission.id)}>
                    <Eye />
                    {submission.status === RegistrationStatus.PENDING && canDelete ? 'Review' : 'View'}
                  </Button>
                  {canDelete && deleteButton(submission)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {selected && (
        <SubmissionDetail
          key={selected.id}
          submission={selected}
          onClose={() => setSelectedId(null)}
          onUpdate={() => mutate()}
        />
      )}
    </SplitView>
  )
}

function SubmissionDetail({
  submission,
  onClose,
  onUpdate,
}: {
  submission: RegistrationSubmission
  onClose: () => void
  onUpdate: () => void
}) {
  const { data: session } = useSession()
  const [isApproving, setIsApproving] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [reviewNote, setReviewNote] = useState('')
  const [yearLevel, setYearLevel] = useState<YearLevel>(YearLevel.YEAR_1)

  const handleApprove = async () => {
    setIsApproving(true)
    try {
      const res = await fetch(`/api/registration/submissions/${submission.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          note: reviewNote,
          yearLevel,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to approve')
      }

      const data = await res.json()
      toast.success('Registration approved!', {
        description: data.tempPassword
          ? `A set-password link is being emailed to them. If they don’t receive it, share this temporary password: ${data.tempPassword}`
          : 'Linked to their existing account. Their password is unchanged.',
        duration: 10000,
      })
      onUpdate()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to approve registration')
    } finally {
      setIsApproving(false)
    }
  }

  const handleReject = async () => {
    if (!reviewNote.trim()) {
      toast.error('Please provide a reason for rejection')
      return
    }

    setIsRejecting(true)
    try {
      const res = await fetch(`/api/registration/submissions/${submission.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          note: reviewNote,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to reject')
      }

      toast.success('Registration rejected')
      onUpdate()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reject registration')
    } finally {
      setIsRejecting(false)
    }
  }

  const canReview = session?.user && canReviewRegistrations(session.user.role) && submission.status === RegistrationStatus.PENDING
  const isReturningApplicant = submission.status === RegistrationStatus.PENDING && Boolean(submission.createdUser)

  const fmt = (d: Date | string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const section = (title: string, items: { label: string; value: React.ReactNode }[]) => (
    <section className="flex flex-col gap-1">
      <h3 className="pt-2 text-xs font-medium tracking-[0.06em] text-ink-3 uppercase">{title}</h3>
      <KeyValueList items={items} />
    </section>
  )

  return (
    <DetailPanel
      open
      onClose={onClose}
      label={`Registration from ${submission.fullName}`}
      title={
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold text-ink">{submission.fullName}</h2>
          <p className="flex items-center gap-2 text-xs text-ink-3">
            Submitted {fmt(submission.createdAt)}
            <StatusBadge tone={STATUS_META[submission.status].tone}>{STATUS_META[submission.status].label}</StatusBadge>
          </p>
        </div>
      }
      footer={
        canReview && (
          <>
            <Button variant="destructive" className="flex-1" onClick={handleReject} disabled={isApproving || isRejecting}>
              {isRejecting ? <Loader2 className="animate-spin" /> : <XCircle />}
              Reject
            </Button>
            <Button className="flex-1" onClick={handleApprove} disabled={isApproving || isRejecting}>
              {isApproving ? <Loader2 className="animate-spin" /> : <CheckCircle />}
              Approve
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-3">
        {isReturningApplicant && (
          <p className="rounded-md bg-info-tint px-3 py-2 text-[13px] text-info">
            Returning applicant — linked to the existing account for{' '}
            <strong>{submission.createdUser?.name || submission.createdUser?.email}</strong>. Approving updates that account; no new
            login is created and their year level is kept.
          </p>
        )}
        {submission.profileImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded Vercel Blob URL
          <img src={submission.profileImageUrl} alt={`${submission.fullName}'s profile`} className="size-16 rounded-full border border-line object-cover" />
        )}
        {section('Personal information', [
          { label: 'Email', value: <ContactLink kind="email" value={submission.email} name={submission.fullName} label="applicant email" /> },
          { label: 'Phone', value: <ContactLink kind="phone" value={submission.phone} name={submission.fullName} label="applicant phone number" className="font-mono text-xs" /> },
          { label: 'Date of birth', value: fmt(submission.dateOfBirth) },
          { label: 'Grade', value: getGradeDisplayName(submission.grade) },
        ])}
        {section('Church information', [
          { label: 'Father of confession', value: submission.fatherOfConfessionName || <span className="text-ink-3">After approval</span> },
        ])}
        {section('Service history', [
          { label: 'Currently serving', value: submission.currentlyServing ? 'Yes' : 'No' },
          { label: 'Previously served', value: submission.previouslyServed ? `Yes${submission.previousServiceLocation ? ` · ${submission.previousServiceLocation}` : ''}` : 'No' },
          { label: 'Attended Prep', value: submission.previouslyAttendedPrep ? 'Yes' : 'No' },
        ])}
        {section('Mentor servant', [
          { label: 'Name', value: submission.mentorName || <span className="text-ink-3">Not provided</span> },
          { label: 'Phone', value: submission.mentorPhone ? <ContactLink kind="phone" value={submission.mentorPhone} name={submission.mentorName} label="mentor servant's phone number" /> : <span className="text-ink-3">Not provided</span> },
          { label: 'Email', value: submission.mentorEmail ? <ContactLink kind="email" value={submission.mentorEmail} name={submission.mentorName} label="mentor servant's email" /> : <span className="text-ink-3">Not provided</span> },
        ])}
        {section('Approval form', [
          {
            label: 'Signed form',
            value: submission.approvalFormUrl ? (
              <a href={submission.approvalFormUrl} target="_blank" rel="noopener noreferrer" className="text-accent-ink hover:underline">
                View {submission.approvalFormFilename || 'signed form'}
              </a>
            ) : (
              <span className="text-ink-3">Not provided yet</span>
            ),
          },
        ])}

        {canReview && (
          <div className="flex flex-col gap-3 border-t border-line pt-3">
            {!isReturningApplicant && (
              <div className="grid gap-1.5">
                <Label htmlFor="yearLevel">Starting year level</Label>
                <Select value={yearLevel} onValueChange={(value) => setYearLevel(value as YearLevel)}>
                  <SelectTrigger id="yearLevel" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={YearLevel.YEAR_1}>Year 1</SelectItem>
                    <SelectItem value={YearLevel.YEAR_2}>Year 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="reviewNote">Review note</Label>
              <Textarea
                id="reviewNote"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Optional for approval, required for rejection"
              />
            </div>
          </div>
        )}

        {submission.status !== RegistrationStatus.PENDING &&
          section('Review', [
            { label: 'Reviewed by', value: submission.reviewer?.name ?? '—' },
            { label: 'Reviewed', value: submission.reviewedAt ? new Date(submission.reviewedAt).toLocaleString() : '—' },
            ...(submission.reviewNote ? [{ label: 'Note', value: submission.reviewNote }] : []),
          ])}
      </div>
    </DetailPanel>
  )
}

function InviteCodesTab() {
  const { data: inviteCodes, mutate } = useInviteCodes()
  const { data: settings, mutate: mutateSettings } = useRegistrationSettings()
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false)
  const [isTogglingRegistration, setIsTogglingRegistration] = useState(false)

  const registrationEnabled = settings?.registrationEnabled ?? true

  const handleToggleRegistration = async () => {
    setIsTogglingRegistration(true)
    try {
      const res = await fetch('/api/registration/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationEnabled: !registrationEnabled }),
      })

      if (!res.ok) {
        throw new Error('Failed to update settings')
      }

      toast.success(`Registration ${!registrationEnabled ? 'enabled' : 'disabled'}`)
      mutateSettings()
    } catch {
      toast.error('Failed to update registration settings')
    } finally {
      setIsTogglingRegistration(false)
    }
  }

  const handleToggleCodeActive = async (codeId: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/registration/invite-codes/${codeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      })

      if (!res.ok) {
        throw new Error('Failed to update code')
      }

      toast.success(`Code ${!currentActive ? 'activated' : 'deactivated'}`)
      mutate()
    } catch {
      toast.error('Failed to update code')
    }
  }

  const handleDeleteCode = async (codeId: string) => {
    try {
      const res = await fetch(`/api/registration/invite-codes/${codeId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete code')
      }

      toast.success('Code deleted')
      mutate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete code')
    }
  }

  const getCodeStatusBadge = (code: InviteCode) => {
    const now = new Date()
    if (!code.isActive) {
      return <StatusBadge tone="neutral">Revoked</StatusBadge>
    }
    if (code.expiresAt && new Date(code.expiresAt) < now) {
      return <StatusBadge tone="warn">Expired</StatusBadge>
    }
    if (code.maxUses > 0 && code.usageCount >= code.maxUses) {
      return <StatusBadge tone="neutral">Exhausted</StatusBadge>
    }
    return <StatusBadge tone="ok">Active</StatusBadge>
  }

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    toast.success('Code copied to clipboard!')
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Invite Codes</CardTitle>
              <CardDescription>Generate and manage registration invite codes</CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant={registrationEnabled ? "destructive" : "default"}
                size="sm"
                onClick={handleToggleRegistration}
                disabled={isTogglingRegistration}
                className="w-full sm:w-auto"
              >
                {registrationEnabled ? <PowerOff className="w-4 h-4 mr-1" /> : <Power className="w-4 h-4 mr-1" />}
                <span className="hidden sm:inline">{registrationEnabled ? 'Close Registration' : 'Open Registration'}</span>
                <span className="sm:hidden">{registrationEnabled ? 'Close' : 'Open'}</span>
              </Button>
              <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="w-full sm:w-auto">
                    <Plus className="w-4 h-4 mr-1" />
                    Generate Code
                  </Button>
                </DialogTrigger>
                <GenerateCodeDialog onSuccess={() => {
                  mutate()
                  setIsGenerateDialogOpen(false)
                }} />
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!inviteCodes || inviteCodes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500">
                      No invite codes yet
                    </TableCell>
                  </TableRow>
                ) : (
                  inviteCodes.map((code: InviteCode) => (
                    <TableRow key={code.id}>
                      <TableCell className="font-mono font-semibold">{code.code}</TableCell>
                      <TableCell>{code.label || '-'}</TableCell>
                      <TableCell>
                        {code.usageCount} / {code.maxUses === 0 ? '∞' : code.maxUses}
                      </TableCell>
                      <TableCell>
                        {code.expiresAt ? new Date(code.expiresAt).toLocaleDateString() : 'Never'}
                      </TableCell>
                      <TableCell>{getCodeStatusBadge(code)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyCode(code.code)}
                            title="Copy code"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleCodeActive(code.id, code.isActive)}
                            title={code.isActive ? 'Deactivate' : 'Activate'}
                          >
                            {code.isActive ? <Ban className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                          </Button>
                          {code._count.registrations === 0 && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" title="Delete code">
                                  <Trash2 className="w-4 h-4 text-red-600" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Invite Code?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete code <strong>{code.code}</strong>? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteCode(code.id)} className="bg-red-600 hover:bg-red-700">
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-4">
            {!inviteCodes || inviteCodes.length === 0 ? (
              <div className="text-center text-gray-500 py-8">No invite codes yet</div>
            ) : (
              inviteCodes.map((code: InviteCode) => (
                <Card key={code.id} className="border">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="font-mono font-bold text-lg">{code.code}</div>
                        {code.label && <div className="text-sm text-gray-600">{code.label}</div>}
                      </div>
                      {getCodeStatusBadge(code)}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-600">Uses:</span>{' '}
                        {code.usageCount} / {code.maxUses === 0 ? '∞' : code.maxUses}
                      </div>
                      <div>
                        <span className="text-gray-600">Expires:</span>{' '}
                        {code.expiresAt ? new Date(code.expiresAt).toLocaleDateString() : 'Never'}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyCode(code.code)}
                        className="flex-1"
                      >
                        <Copy className="w-4 h-4 mr-1" />
                        Copy
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleCodeActive(code.id, code.isActive)}
                        className="flex-1"
                      >
                        {code.isActive ? (
                          <>
                            <Ban className="w-4 h-4 mr-1" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4 mr-1" />
                            Activate
                          </>
                        )}
                      </Button>
                      {code._count.registrations === 0 && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Invite Code?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete code <strong>{code.code}</strong>? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteCode(code.id)} className="bg-red-600 hover:bg-red-700">
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function GenerateCodeDialog({ onSuccess }: { onSuccess: () => void }) {
  const [label, setLabel] = useState('')
  const [maxUses, setMaxUses] = useState('10')
  const [expiresAt, setExpiresAt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  const handleGenerate = async () => {
    setIsGenerating(true)
    try {
      const res = await fetch('/api/registration/invite-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label || null,
          maxUses: parseInt(maxUses) || 0,
          expiresAt: expiresAt || null,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to generate code')
      }

      const data = await res.json()
      toast.success('Invite code generated!', {
        description: `Code: ${data.code}`,
      })
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate code')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Generate Invite Code</DialogTitle>
        <DialogDescription>Create a new registration invite code</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label htmlFor="label">Label (optional)</Label>
          <Input
            id="label"
            placeholder="e.g., Fall 2026 Registration"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="maxUses">Maximum Uses (0 = unlimited)</Label>
          <Input
            id="maxUses"
            type="number"
            min="0"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="expiresAt">Expiration Date (optional)</Label>
          <Input
            id="expiresAt"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-1" />
              Generate
            </>
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
