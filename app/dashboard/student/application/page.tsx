'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, Circle, Download, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { mutate } from 'swr'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { isStudent } from '@/lib/roles'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
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
      if (data.complete) {
        void mutate('/api/notifications?limit=15')
        void mutate('/api/registration/application')
      }
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
    <div className="content-reveal flex min-w-0 flex-col gap-5">
        <PageHeader
          title={annualMentorRequired ? 'Confirm your mentor' : 'Application'}
          meta={[annualMentorRequired
            ? `Confirm your mentor servant’s contact information for ${academicYear?.name ?? 'the current academic year'}`
            : 'Complete the rest of your Servants Prep application']}
        />
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex min-w-0 flex-col gap-5">

        {complete ? (
          <div role="status" className="flex items-start gap-3 rounded-lg bg-ok-tint px-4 py-3 text-ok">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-semibold">
                  {annualMentorRequired ? 'Your mentor information is confirmed.' : 'Your application is complete.'}
                </p>
                <p className="mt-0.5 text-[13px] text-ink-2">
                  {annualMentorRequired
                    ? `You are up to date for ${academicYear?.name ?? 'the current academic year'}.`
                    : 'The application reminder has been cleared.'}
                </p>
              </div>
          </div>
        ) : (
          <div role="status" className="flex items-start gap-3 rounded-lg bg-warn-tint px-4 py-3 text-warn">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              <p className="text-[13px]">
                <strong>Finish your application.</strong> This reminder cannot be dismissed until all sections below are complete.
              </p>
          </div>
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
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="animate-spin" />}
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
              className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-accent-ink hover:underline"
            >
              <Download className="size-4" />
              Download approval form template
            </a>
            {details.approvalFormUrl ? (
              <div className="flex flex-col gap-3 rounded-md bg-ok-tint px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-[13px] font-medium text-ok">
                  <CheckCircle2 className="h-5 w-5" />
                  {details.approvalFormFilename}
                </div>
                <a className="text-[13px] text-accent-ink hover:underline" href={details.approvalFormUrl} target="_blank" rel="noopener noreferrer">
                  View uploaded form
                </a>
              </div>
            ) : (
              <p className="text-[13px] text-warn">No approval form has been uploaded yet.</p>
            )}

            <div>
              <Label htmlFor="approval-form" className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border border-brand bg-brand px-4 text-[15px] font-medium text-white hover:bg-brand-hover md:h-8 md:px-3 md:text-[13px]">
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
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
              <p className="mt-2 text-xs text-ink-3">PNG, JPG, GIF, or PDF (maximum 4.5 MB)</p>
            </div>
          </CardContent>
        </Card>}
      </div>

      <Panel title="Progress">
        <ol className="flex flex-col gap-0.5 px-4 py-3">
          {[
            { label: 'Registration approved', done: true },
            { label: 'Mentor servant', done: Boolean(details.mentorName && details.mentorEmail && details.mentorPhone) },
            ...(showChurchInformation || details.fatherOfConfessionName ? [{ label: 'Father of confession', done: Boolean(details.fatherOfConfessionName) }] : []),
            ...(showApprovalForm || details.approvalFormUrl ? [{ label: 'Approval form', done: Boolean(details.approvalFormUrl) }] : []),
          ].map((step) => (
            <li key={step.label} className="flex min-h-9 items-center gap-2.5 text-[13px]">
              {step.done ? (
                <span className="flex size-5 items-center justify-center rounded-full bg-ok text-white dark:text-canvas">
                  <Check className="size-3" strokeWidth={3} aria-hidden />
                </span>
              ) : (
                <Circle className="size-5 text-line-strong" aria-hidden />
              )}
              <span className={step.done ? 'text-ink' : 'text-ink-2'}>{step.label}</span>
              <span className="sr-only">{step.done ? 'done' : 'to do'}</span>
            </li>
          ))}
        </ol>
      </Panel>
      </div>
    </div>
  )
}
