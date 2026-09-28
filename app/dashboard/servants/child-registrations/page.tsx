'use client'

import { useState } from 'react'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'
import { useChildRegistrationRequests, useSundaySchoolClasses } from '@/lib/swr'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { getLevelDisplayName } from '@/lib/sunday-school-class'
import { SundaySchoolLevel } from '@prisma/client'
import { CheckCircle, Loader2 } from 'lucide-react'

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
  const { data: requests, mutate } = useChildRegistrationRequests('PENDING')
  const [selectedRequest, setSelectedRequest] = useState<ChildRegistrationRequest | null>(null)
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false)

  if (status === 'loading' || !session || !hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center">
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
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Child Registration Requests</h1>
          <p className="text-gray-600 mt-1">Review and place parent-submitted registration requests</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pending Requests</CardTitle>
            <CardDescription>Requests at levels you coordinate</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!requests || requests.length === 0 ? (
              <p className="text-sm text-gray-500">No pending requests.</p>
            ) : (
              requests.map((request: ChildRegistrationRequest) => (
                <div
                  key={request.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border rounded-lg p-4"
                >
                  <div>
                    <div className="font-medium">
                      {request.firstName} {request.lastName}
                    </div>
                    <div className="text-sm text-gray-600">
                      {getLevelDisplayName(request.intendedLevel)} &middot;{' '}
                      {request.gender === 'MALE' ? 'Boy' : request.gender === 'FEMALE' ? 'Girl' : 'Gender not specified'} &middot; Submitted by{' '}
                      {request.submittedBy.name} ({request.submittedBy.email})
                    </div>
                    {request.notes && (
                      <div className="text-sm text-gray-500 mt-1">{request.notes}</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => {
                        setSelectedRequest(request)
                        setIsApproveDialogOpen(true)
                      }}
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Approve
                    </Button>
                    <RejectAlertDialog
                      requestName={`${request.firstName} ${request.lastName}`}
                      onConfirm={(note) => handleReject(request.id, note)}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
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
            className="bg-red-600 hover:bg-red-700"
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
  const [classId, setClassId] = useState('')
  const [isApproving, setIsApproving] = useState(false)

  const matchingClasses = ((classes ?? []) as SundaySchoolClassOption[]).filter(
    (c) => c.level === request.intendedLevel
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
            <div>Phone: {request.guardianPhone}</div>
            {request.guardianEmail && <div>Email: {request.guardianEmail}</div>}
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
