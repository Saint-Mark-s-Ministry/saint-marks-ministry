'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { mutate } from 'swr'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { isStudent } from '@/lib/roles'
import { PageHeader } from '@/components/admin/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DashboardSkeleton } from '@/components/ui/skeleton'

interface ApplicationDetails {
  fatherOfConfessionName: string | null
  approvalFormUrl: string | null
  approvalFormFilename: string | null
  mentorName: string | null
  mentorPhone: string | null
  mentorEmail: string | null
}

interface AcademicYearSummary {
  id: string
  name: string
}

export default function CompleteApplicationPage() {
  const { session, status } = useAdminGuard(isStudent)
  const [details, setDetails] = useState<ApplicationDetails | null>(null)
  const [complete, setComplete] = useState(false)
  const [showChurchInformation, setShowChurchInformation] = useState(true)
  const [showApprovalForm, setShowApprovalForm] = useState(true)
  const [annualMentorRequired, setAnnualMentorRequired] = useState(false)
  const [academicYear, setAcademicYear] = useState<AcademicYearSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!session?.user) return

    fetch('/api/registration/application')
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load application')
        setDetails(data.application)
        setComplete(data.complete)
        setShowChurchInformation(data.showChurchInformation)
        setShowApprovalForm(data.showApprovalForm)
        setAnnualMentorRequired(data.annualMentorRequired)
        setAcademicYear(data.academicYear)
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Unable to load application'))
      .finally(() => setLoading(false))
  }, [session])

  const uploadApprovalForm = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch('/api/registration/application/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Upload failed')

      setDetails((current) => current && ({
        ...current,
        approvalFormUrl: data.url,
        approvalFormFilename: data.filename,
      }))
      setComplete(data.complete)
      if (data.complete) void mutate('/api/notifications?limit=15')
      toast.success('Approval form uploaded')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const saveApplication = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!details) return

    setSaving(true)
    try {
      const response = await fetch('/api/registration/application', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fatherOfConfessionName: details.fatherOfConfessionName,
          mentorName: details.mentorName,
          mentorPhone: details.mentorPhone,
          mentorEmail: details.mentorEmail,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to save application')

      setDetails(data.application)
      setComplete(data.complete)
      setShowChurchInformation(data.showChurchInformation)
      setShowApprovalForm(data.showApprovalForm)
      setAnnualMentorRequired(data.annualMentorRequired)
      setAcademicYear(data.academicYear)
      if (data.complete) void mutate('/api/notifications?limit=15')
      toast.success(
        annualMentorRequired
          ? 'Mentor information confirmed'
          : data.complete ? 'Application completed' : 'Application details saved'
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save application')
    } finally {
      setSaving(false)
    }
  }

  if (loading || status === 'loading') return <DashboardSkeleton />

  if (!details) {
    return (
      <div className="mx-auto max-w-2xl p-4 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Application unavailable</CardTitle>
            <CardDescription>We could not find an approved registration for this account.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          title={annualMentorRequired ? 'Confirm Your Mentor Information' : 'Complete Your Application'}
          description={annualMentorRequired
            ? `Confirm your mentor servant contact information for ${academicYear?.name ?? 'the current academic year'}.`
            : 'Add the remaining church and mentor information after your registration was approved.'}
        />

        {complete ? (
          <Card className="border-green-300 bg-green-50/70 dark:border-green-800 dark:bg-green-950/40">
            <CardContent className="flex items-start gap-3 pt-6">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-green-700" />
              <div>
                <p className="font-semibold text-green-900">
                  {annualMentorRequired ? 'Your mentor information is confirmed.' : 'Your application is complete.'}
                </p>
                <p className="mt-1 text-sm text-green-800">
                  {annualMentorRequired
                    ? `You are up to date for ${academicYear?.name ?? 'the current academic year'}.`
                    : 'The application reminder has been cleared.'}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/40">
            <CardContent className="flex items-start gap-3 pt-6">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <p className="text-sm text-amber-900">
                This reminder cannot be dismissed until all sections below are complete.
              </p>
            </CardContent>
          </Card>
        )}

        <form onSubmit={saveApplication} className="space-y-6">
          {showChurchInformation && (
            <Card>
              <CardHeader>
                <CardTitle>Church Information</CardTitle>
                <CardDescription>Tell us who your father of confession is.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Label htmlFor="father-of-confession">Father of Confession</Label>
                <Input
                  id="father-of-confession"
                  required
                  value={details.fatherOfConfessionName ?? ''}
                  onChange={(event) => setDetails({ ...details, fatherOfConfessionName: event.target.value })}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Mentor Servant Information</CardTitle>
              <CardDescription>
                {annualMentorRequired
                  ? `Confirm or update these details for ${academicYear?.name ?? 'the current academic year'}.`
                  : 'Provide your mentor servant\'s contact information.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mentor-name">Mentor Servant&apos;s Name</Label>
                <Input
                  id="mentor-name"
                  required
                  value={details.mentorName ?? ''}
                  onChange={(event) => setDetails({ ...details, mentorName: event.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mentor-phone">Phone Number</Label>
                  <Input
                    id="mentor-phone"
                    type="tel"
                    required
                    value={details.mentorPhone ?? ''}
                    onChange={(event) => setDetails({ ...details, mentorPhone: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mentor-email">Email Address</Label>
                  <Input
                    id="mentor-email"
                    type="email"
                    required
                    value={details.mentorEmail ?? ''}
                    onChange={(event) => setDetails({ ...details, mentorEmail: event.target.value })}
                  />
                </div>
              </div>
              <Button type="submit" disabled={saving} className="bg-maroon-600 hover:bg-maroon-700">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {annualMentorRequired ? 'Confirm mentor information' : 'Save application details'}
              </Button>
            </CardContent>
          </Card>
        </form>

        {showApprovalForm && <Card>
          <CardHeader>
            <CardTitle>Approval Form</CardTitle>
            <CardDescription>Upload the signed approval form from your mentor servant and father of confession.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <a
              href="https://drive.google.com/file/d/1ebGILBc8OAAPaTWbpmwLDDqjEm-lnbQ7/view?usp=drivesdk"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-maroon-700 hover:underline"
            >
              <Download className="h-4 w-4" />
              Download Approval Form Template
            </a>
            {details.approvalFormUrl ? (
              <div className="flex flex-col gap-3 rounded-lg border border-green-200 bg-green-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-green-900">
                  <CheckCircle2 className="h-5 w-5" />
                  {details.approvalFormFilename}
                </div>
                <a className="text-sm text-maroon-700 hover:underline" href={details.approvalFormUrl} target="_blank" rel="noopener noreferrer">
                  View uploaded form
                </a>
              </div>
            ) : (
              <p className="text-sm text-amber-800">No approval form has been uploaded yet.</p>
            )}

            <div>
              <Label htmlFor="approval-form" className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-maroon-600 px-4 py-2 text-sm font-medium text-white hover:bg-maroon-700">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {details.approvalFormUrl ? 'Replace form' : 'Upload form'}
              </Label>
              <Input
                id="approval-form"
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={uploadApprovalForm}
                disabled={uploading}
              />
              <p className="mt-2 text-xs text-gray-500">PNG, JPG, GIF, or PDF (maximum 4.5 MB)</p>
            </div>
          </CardContent>
        </Card>}
      </div>
    </div>
  )
}
