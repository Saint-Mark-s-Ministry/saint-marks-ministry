'use client'

import { useState } from 'react'
import { ContactLink } from '@/components/contact-link'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'
import { useChildRegistrationRequests, useSundaySchoolAgeGroups, useSundaySchoolClasses } from '@/lib/swr'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { getLevelDisplayName, sortClassesByAgeGroup } from '@/lib/sunday-school-class'
import { SundaySchoolLevel } from '@prisma/client'
import { CheckCircle, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { Initials } from '@/components/ds/person'
import { StatusBadge } from '@/components/ds/status-badge'
import { EmptyState } from '@/components/ui/empty-state'

interface ChildRegistrationRequest {
  id: string
  firstName: string
  lastName: string
  birthDate: string
  gender: 'MALE' | 'FEMALE' | null
  intendedLevel: SundaySchoolLevel
  guardianName: string
  guardianPhone: string
  guardianEmail: string | null
  notes: string | null
  submittedBy: { name: string; email: string; phone: string | null }
  createdAt: string
}

interface SundaySchoolClassOption {
  id: string
  name: string
  level: SundaySchoolLevel
}

export default function ChildRegistrationsPage() {
  const { session, status, hasAccess } = useSundaySchoolGuard()
  const { data: requests, error: loadError, mutate } = useChildRegistrationRequests('PENDING')
  const [selectedRequest, setSelectedRequest] = useState<ChildRegistrationRequest | null>(null)
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false)

  if (status === 'loading' || !session || !hasAccess) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-maroon-600" />
      </div>
    )
  }

  const handleReject = async (id: string, note: string) => {
    try {
      const res = await fetch(`/api/sunday-school/child-registrations/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', note }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to reject request')
      }

      toast.success('Registration request rejected')
      mutate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reject request')
    }
  }

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-col gap-5">
        <PageHeader title="Child registration requests" meta={['Review and place parent-submitted requests', 'levels you coordinate']} />

        <Panel
          title="Pending requests"
          actions={requests && requests.length > 0 ? <StatusBadge tone="warn">{requests.length} pending</StatusBadge> : undefined}
        >
          {loadError ? (
            <EmptyState
              title="Couldn’t load requests"
              message="Something went wrong on our side. Try again in a moment."
              action={<Button variant="outline" onClick={() => mutate()}>Try again</Button>}
            />
          ) : !requests || requests.length === 0 ? (
            <EmptyState message="No pending requests. New ones appear here when a parent registers a child." />
          ) : (
            <ul className="divide-y divide-line">
              {requests.map((request: ChildRegistrationRequest) => {
                const name = `${request.firstName} ${request.lastName}`
                return (
                  <li key={request.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <Initials name={name} size={32} />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[14px] font-medium text-ink">{name}</span>
                          <StatusBadge tone="neutral" dot={false}>{getLevelDisplayName(request.intendedLevel)}</StatusBadge>
                          <StatusBadge tone="warn">Pending</StatusBadge>
                        </span>
                        <span className="text-xs text-ink-3">
                          {request.gender === 'MALE' ? 'Boy' : request.gender === 'FEMALE' ? 'Girl' : 'Gender not given'} · Guardian {request.submittedBy.name} ·{' '}
                          <ContactLink kind="email" value={request.submittedBy.email} name={request.submittedBy.name} label="guardian's email" />
                        </span>
                        {request.notes && <span className="text-[13px] text-ink-2">Notes: {request.notes}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <RejectAlertDialog requestName={name} onConfirm={(note) => handleReject(request.id, note)} />
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedRequest(request)
                          setIsApproveDialogOpen(true)
                        }}
                      >
                        <CheckCircle />
                        Approve
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>

      {selectedRequest && (
        <ApproveDialog
          request={selectedRequest}
          open={isApproveDialogOpen}
          onOpenChange={setIsApproveDialogOpen}
          onSuccess={() => {
            mutate()
            setIsApproveDialogOpen(false)
          }}
        />
      )}
    </div>
  )
}

function RejectAlertDialog({
  requestName,
  onConfirm,
}: {
  requestName: string
  onConfirm: (note: string) => void
}) {
  const [note, setNote] = useState('')

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="destructive">
          Reject
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reject Registration Request?</AlertDialogTitle>
          <AlertDialogDescription>
            Reject the request to register <strong>{requestName}</strong>? You can add an optional
            note explaining why.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          placeholder="Reason (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onConfirm(note)}
            className="bg-bad text-white hover:bg-bad/90"
          >
            Reject
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ApproveDialog({
  request,
  open,
  onOpenChange,
  onSuccess,
}: {
  request: ChildRegistrationRequest
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const { data: classes } = useSundaySchoolClasses()
  const { data: ageGroupsData } = useSundaySchoolAgeGroups()
  const [classId, setClassId] = useState('')
  const [isApproving, setIsApproving] = useState(false)

  const matchingClasses = sortClassesByAgeGroup(
    ((classes ?? []) as SundaySchoolClassOption[]).filter(c => c.level === request.intendedLevel),
    (ageGroupsData as Array<{ levels: SundaySchoolLevel[]; name: string }> | undefined) ?? []
  )

  const handleApprove = async () => {
    if (!classId) {
      toast.error('Please select a class')
      return
    }

    setIsApproving(true)
    try {
      const res = await fetch(`/api/sunday-school/child-registrations/${request.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', classId }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to approve request')
      }

      toast.success(`${request.firstName} ${request.lastName} placed in class!`)
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to approve request')
    } finally {
      setIsApproving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Place {request.firstName} {request.lastName}</DialogTitle>
          <DialogDescription>
            Choose a class at {getLevelDisplayName(request.intendedLevel)} to place this child in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="classId">Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger id="classId">
                <SelectValue placeholder="Select a class..." />
              </SelectTrigger>
              <SelectContent>
                {matchingClasses.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-gray-500">
                    No classes at this level yet
                  </div>
                ) : (
                  matchingClasses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-gray-600 space-y-1 border-t pt-3">
            <div>Guardian: {request.guardianName}</div>
            <div>Phone: <ContactLink kind="phone" value={request.guardianPhone} name={request.guardianName} label="guardian's phone number" /></div>
            {request.guardianEmail && <div>Email: <ContactLink kind="email" value={request.guardianEmail} name={request.guardianName} label="guardian's email" /></div>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleApprove}
            disabled={isApproving || !classId}
            className="bg-green-600 hover:bg-green-700"
          >
            {isApproving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
