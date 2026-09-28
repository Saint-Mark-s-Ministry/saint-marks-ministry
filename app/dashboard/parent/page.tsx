'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { isParent } from '@/lib/roles'
import { useParentChildren, useSundaySchoolLessons } from '@/lib/swr'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { LEVEL_ORDER, getLevelDisplayName } from '@/lib/sunday-school-class'
import { SundaySchoolLevel } from '@prisma/client'
import { CheckCircle, Clock, ExternalLink, Loader2, Plus, XCircle } from 'lucide-react'
import type { RegistrationStatus } from '@prisma/client'
import type { SundaySchoolWeeklyLessonsResponse } from '@/types/sunday-school'

interface FormData {
  firstName: string
  lastName: string
  birthDate: string
  gender: string
  intendedLevel: string
  guardianName: string
  guardianPhone: string
  guardianEmail: string
  notes: string
}

function statusBadge(status: RegistrationStatus) {
  switch (status) {
    case 'PENDING':
      return (
        <Badge variant="outline" className="border-yellow-500 text-yellow-700">
          <Clock className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      )
    case 'APPROVED':
      return (
        <Badge variant="outline" className="border-green-500 text-green-700">
          <CheckCircle className="w-3 h-3 mr-1" />
          Approved
        </Badge>
      )
    case 'REJECTED':
      return (
        <Badge variant="outline" className="border-red-500 text-red-700">
          <XCircle className="w-3 h-3 mr-1" />
          Rejected
        </Badge>
      )
  }
}

export default function ParentDashboardPage() {
  const { session, status } = useAdminGuard(isParent)
  const { data, mutate } = useParentChildren()
  const { data: lessonData } = useSundaySchoolLessons()
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  if (status === 'loading' || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-maroon-600" />
      </div>
    )
  }

  const children = data?.children ?? []
  const pendingRequests = data?.pendingRequests ?? []
  const lessons = (lessonData as SundaySchoolWeeklyLessonsResponse | undefined)?.lessons ?? []

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">My Children</h1>
            <p className="text-gray-600 mt-1">Manage your Sunday School registrations</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-maroon-600 hover:bg-maroon-700">
                <Plus className="w-4 h-4 mr-1" />
                Register a Child
              </Button>
            </DialogTrigger>
            <RegisterChildDialog
              onSuccess={() => {
                mutate()
                setIsDialogOpen(false)
              }}
            />
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>My Children</CardTitle>
            <CardDescription>Children linked to your account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {children.length === 0 ? (
              <p className="text-sm text-gray-500">No children linked yet.</p>
            ) : (
              children.map((child: {
                id: string
                firstName: string
                lastName: string
                level: SundaySchoolLevel
                isActive: boolean
                class: { name: string } | null
              }) => (
                <div
                  key={child.id}
                  className="flex items-center justify-between border rounded-lg p-3"
                >
                  <div>
                    <div className="font-medium">
                      {child.firstName} {child.lastName}
                    </div>
                    <div className="text-sm text-gray-600">
                      {getLevelDisplayName(child.level)} &middot;{' '}
                      {child.class ? child.class.name : 'Unassigned'}
                    </div>
                  </div>
                  <Badge variant={child.isActive ? 'default' : 'outline'}>
                    {child.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Lessons</CardTitle>
            <CardDescription>Slides and resources shared by your children&apos;s classes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {lessons.length === 0 ? (
              <p className="text-sm text-gray-500">No upcoming lesson links have been shared yet.</p>
            ) : lessons.map(lesson => (
              <div key={lesson.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{lesson.title || lesson.class.name}</p>
                    <p className="text-sm text-gray-600">
                      {lesson.class.name} · {new Date(lesson.sundayDate).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  {lesson.resources.length > 0 && <Badge className="bg-green-600">Ready</Badge>}
                </div>
                {lesson.resources.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {lesson.resources.map(resource => (
                      <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-maroon-700 hover:underline">
                        <ExternalLink className="h-3.5 w-3.5" /> {resource.title}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending Requests</CardTitle>
            <CardDescription>Registration requests you've submitted</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingRequests.length === 0 ? (
              <p className="text-sm text-gray-500">No requests submitted yet.</p>
            ) : (
              pendingRequests.map((request: {
                id: string
                firstName: string
                lastName: string
                intendedLevel: SundaySchoolLevel
                status: RegistrationStatus
              }) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between border rounded-lg p-3"
                >
                  <div>
                    <div className="font-medium">
                      {request.firstName} {request.lastName}
                    </div>
                    <div className="text-sm text-gray-600">
                      {getLevelDisplayName(request.intendedLevel)}
                    </div>
                  </div>
                  {statusBadge(request.status)}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function RegisterChildDialog({ onSuccess }: { onSuccess: () => void }) {
  const { data: session } = useSession()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    birthDate: '',
    gender: '',
    intendedLevel: '',
    guardianName: session?.user?.name ?? '',
    guardianPhone: '',
    guardianEmail: session?.user?.email ?? '',
    notes: '',
  })

  const handleSubmit = async () => {
    if (!formData.firstName || !formData.lastName || !formData.birthDate || !formData.intendedLevel) {
      toast.error('Please fill in all required fields')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/parent/children/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Submission failed')
      }

      toast.success('Registration request submitted! It is now pending review.')
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit request')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Register a Child</DialogTitle>
        <DialogDescription>
          Submit a request to register your child for Sunday School. A coordinator will review
          it and place your child into a class.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name *</Label>
            <Input
              id="firstName"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name *</Label>
            <Input
              id="lastName"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="birthDate">Birth Date *</Label>
          <Input
            id="birthDate"
            type="date"
            value={formData.birthDate}
            onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gender">Gender</Label>
          <Select
            value={formData.gender || 'UNSPECIFIED'}
            onValueChange={(value) => setFormData({
              ...formData,
              gender: value === 'UNSPECIFIED' ? '' : value,
            })}
          >
            <SelectTrigger id="gender">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UNSPECIFIED">Prefer not to specify</SelectItem>
              <SelectItem value="MALE">Boy</SelectItem>
              <SelectItem value="FEMALE">Girl</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="intendedLevel">Grade Level *</Label>
          <Select
            value={formData.intendedLevel}
            onValueChange={(value) => setFormData({ ...formData, intendedLevel: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select grade level..." />
            </SelectTrigger>
            <SelectContent>
              {LEVEL_ORDER.map((level) => (
                <SelectItem key={level} value={level}>
                  {getLevelDisplayName(level)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="border-t pt-4 space-y-4">
          <p className="text-sm font-medium text-gray-700">Guardian Contact</p>
          <div className="space-y-2">
            <Label htmlFor="guardianName">Guardian Name</Label>
            <Input
              id="guardianName"
              value={formData.guardianName}
              onChange={(e) => setFormData({ ...formData, guardianName: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="guardianPhone">Guardian Phone</Label>
              <Input
                id="guardianPhone"
                type="tel"
                value={formData.guardianPhone}
                onChange={(e) => setFormData({ ...formData, guardianPhone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guardianEmail">Guardian Email</Label>
              <Input
                id="guardianEmail"
                type="email"
                value={formData.guardianEmail}
                onChange={(e) => setFormData({ ...formData, guardianEmail: e.target.value })}
              />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            rows={3}
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-maroon-600 hover:bg-maroon-700">
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              Submitting...
            </>
          ) : (
            'Submit Request'
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
