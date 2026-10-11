'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PublicFrame } from '@/components/ds/public-frame'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { StudentGrade } from '@prisma/client'
import { getGradeDisplayName } from '@/lib/registration-utils'
import { CheckCircle2, Loader2, Camera } from 'lucide-react'

type RegistrationStep = 'CODE' | 'FORM' | 'CONFIRMATION'

interface FormData {
  email: string
  fullName: string
  dateOfBirth: string
  phone: string
  previouslyServed: string
  previousServiceLocation: string
  currentlyServing: string
  previouslyAttendedPrep: string
  previousPrepLocation: string
  grade: string
  profileImageUrl: string
  profileImageFilename: string
}

export default function RegistrationForm({ yearName }: { yearName: string | null }) {
  const [step, setStep] = useState<RegistrationStep>('CODE')
  const [inviteCode, setInviteCode] = useState('')
  const [codeLabel, setCodeLabel] = useState<string | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploadingProfilePic, setIsUploadingProfilePic] = useState(false)

  const [formData, setFormData] = useState<FormData>({
    email: '',
    fullName: '',
    dateOfBirth: '',
    phone: '',
    previouslyServed: '',
    previousServiceLocation: '',
    currentlyServing: '',
    previouslyAttendedPrep: '',
    previousPrepLocation: '',
    grade: '',
    profileImageUrl: '',
    profileImageFilename: '',
  })

  const handleValidateCode = async () => {
    if (!inviteCode.trim()) {
      toast.error('Please enter an invite code')
      return
    }

    setIsValidating(true)
    try {
      const res = await fetch('/api/registration/validate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode.trim().toUpperCase() }),
      })

      const data = await res.json()

      if (data.valid) {
        setCodeLabel(data.label)
        setStep('FORM')
        toast.success('Invite code verified!')
      } else {
        toast.error(data.message || 'Invalid invite code')
      }
    } catch {
      toast.error('Failed to validate invite code')
    } finally {
      setIsValidating(false)
    }
  }

  const handleProfilePicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type (images only)
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Please upload PNG, JPG, or GIF')
      return
    }

    // Validate file size (4.5 MB)
    if (file.size > 4.5 * 1024 * 1024) {
      toast.error('File size exceeds 4.5 MB limit')
      return
    }

    setIsUploadingProfilePic(true)
    try {
      const uploadData = new FormData()
      uploadData.append('file', file)

      const res = await fetch('/api/registration/upload', {
        method: 'POST',
        headers: {
          'x-invite-code': inviteCode.trim().toUpperCase(),
        },
        body: uploadData,
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Upload failed')
      }

      const data = await res.json()
      setFormData((prev) => ({
        ...prev,
        profileImageUrl: data.url,
        profileImageFilename: data.filename,
      }))
      toast.success('Profile picture uploaded!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload profile picture')
    } finally {
      setIsUploadingProfilePic(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!formData.profileImageUrl) {
      toast.error('Please upload a profile picture')
      return
    }

    if (formData.previouslyServed === 'true' && !formData.previousServiceLocation.trim()) {
      toast.error('Please specify where you previously served')
      return
    }

    if (formData.previouslyAttendedPrep === 'true' && !formData.previousPrepLocation) {
      toast.error('Please specify where you previously attended Servants Prep')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/registration/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteCode: inviteCode.trim().toUpperCase(),
          ...formData,
          previouslyServed: formData.previouslyServed === 'true',
          currentlyServing: formData.currentlyServing === 'true',
          previouslyAttendedPrep: formData.previouslyAttendedPrep === 'true',
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Submission failed')
      }

      setStep('CONFIRMATION')
      toast.success('Registration submitted successfully!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit registration')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Calculate form progress
  const calculateProgress = () => {
    const requiredFields: Array<keyof FormData> = [
      'email',
      'fullName',
      'dateOfBirth',
      'phone',
      'previouslyServed',
      'currentlyServing',
      'previouslyAttendedPrep',
      'grade',
      'profileImageUrl',
    ]

    if (formData.previouslyAttendedPrep === 'true') {
      requiredFields.push('previousPrepLocation')
    }
    if (formData.previouslyServed === 'true') {
      requiredFields.push('previousServiceLocation')
    }

    const filledFields = requiredFields.filter((key) => formData[key] !== '')
    return (filledFields.length / requiredFields.length) * 100
  }

  if (step === 'CODE') {
    return (
      <PublicFrame
        title="Servants Prep registration"
        description={`St. Paul’s Servants Prep${yearName ? ` · ${yearName.replace('-', '–')}` : ''}. Enter the invite code you were given to begin.`}
      >
            <div>
              <Label htmlFor="inviteCode">Invite Code</Label>
              <Input
                id="inviteCode"
                placeholder="Enter your invite code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="mt-1 uppercase"
                onKeyDown={(e) => e.key === 'Enter' && handleValidateCode()}
              />
              <p className="text-sm text-gray-500 mt-2">
                An invite code is required to apply. Contact your mentor or church servant if you don&apos;t have one.
              </p>
            </div>
            <Button
              onClick={handleValidateCode}
              disabled={isValidating || !inviteCode.trim()}
              className="w-full"
            >
              {isValidating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                'Continue'
              )}
            </Button>
      </PublicFrame>
    )
  }

  if (step === 'CONFIRMATION') {
    return (
      <PublicFrame title="Registration submitted" description="Your registration was received and is under review.">
        <div className="flex justify-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-ok-tint text-ok">
            <CheckCircle2 className="size-8" aria-hidden />
          </span>
        </div>
        <div className="rounded-md bg-raised px-4 py-3 text-[13px]">
          <p className="mb-1.5 font-semibold text-ink">What happens next</p>
          <ul className="list-inside list-disc space-y-1 text-ink-2">
            <li>Our admins review your registration.</li>
            <li>You’ll be notified once a decision is made.</li>
            <li>If approved, you’ll receive sign-in details through your mentor.</li>
            <li>After approval, sign in to complete the rest of your application.</li>
          </ul>
        </div>
        <p className="text-center text-[13px] text-ink-3">Questions? Contact the Coptic Orthodox Church of Saint Mark, Jersey City, NJ.</p>
      </PublicFrame>
    )
  }

  return (
    <PublicFrame
      title="Servants Prep registration"
      description={`St. Paul’s Servants Prep${yearName ? ` · ${yearName.replace('-', '–')} academic year` : ''}`}
      badges={codeLabel ? <Badge variant="outline">{codeLabel}</Badge> : undefined}
      width="xl"
    >
            <div className="flex flex-col gap-1.5">
              <Progress value={calculateProgress()} aria-label="Registration progress" />
              <p className="text-xs text-ink-3">{Math.round(calculateProgress())}% complete</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-10">
              {/* Personal Information */}
              <div className="space-y-4">
                <h3 className="border-b border-line pb-2 text-sm font-semibold tracking-[0.04em] text-accent-ink uppercase">Personal Information</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name *</Label>
                    <Input
                      id="fullName"
                      required
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address *</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dateOfBirth">Date of Birth *</Label>
                    <Input
                      id="dateOfBirth"
                      type="date"
                      required
                      value={formData.dateOfBirth}
                      onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                </div>

                {/* Profile Picture */}
                <div className="sm:col-span-2 space-y-2">
                  <Label>Profile Picture *</Label>
                  <div className="border-2 border-dashed rounded-lg p-4 text-center">
                    {formData.profileImageUrl ? (
                      <div className="flex flex-col items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element -- preview of just-uploaded Vercel Blob */}
                        <img
                          src={formData.profileImageUrl}
                          alt="Profile preview"
                          className="w-24 h-24 rounded-full object-cover border-2 border-maroon-600"
                        />
                        <p className="text-sm text-gray-600">{formData.profileImageFilename}</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setFormData({ ...formData, profileImageUrl: '', profileImageFilename: '' })
                          }
                        >
                          Change Photo
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center">
                          <Camera className="w-8 h-8 text-gray-400" />
                        </div>
                        <div>
                          <Label
                            htmlFor="profilePic"
                            className="cursor-pointer text-maroon-600 hover:underline"
                          >
                            Upload photo
                          </Label>
                          <Input
                            id="profilePic"
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/gif"
                            className="hidden"
                            onChange={handleProfilePicUpload}
                            disabled={isUploadingProfilePic}
                          />
                        </div>
                        <p className="text-xs text-gray-500">
                          PNG, JPG, or GIF (Max 4.5 MB)
                        </p>
                        {isUploadingProfilePic && (
                          <p className="text-sm text-maroon-600 font-medium">Uploading...</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Service History */}
              <div className="space-y-4">
                <h3 className="border-b border-line pb-2 text-sm font-semibold tracking-[0.04em] text-accent-ink uppercase">Service History</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="previouslyServed">Have you previously served? *</Label>
                    <Select
                      required
                      value={formData.previouslyServed}
                      onValueChange={(value) => setFormData({
                        ...formData,
                        previouslyServed: value,
                        ...(value === 'false' ? { previousServiceLocation: '' } : {}),
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currentlyServing">Are you currently serving? *</Label>
                    <Select
                      required
                      value={formData.currentlyServing}
                      onValueChange={(value) => setFormData({ ...formData, currentlyServing: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {formData.previouslyServed === 'true' && (
                  <div className="space-y-2">
                    <Label htmlFor="previousServiceLocation">Where did you previously serve? *</Label>
                    <Input
                      id="previousServiceLocation"
                      required
                      placeholder="Church, ministry, or service name"
                      value={formData.previousServiceLocation}
                      onChange={(e) =>
                        setFormData({ ...formData, previousServiceLocation: e.target.value })
                      }
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="previouslyAttendedPrep">
                    Have you previously attended Servants Prep? *
                  </Label>
                  <Select
                    required
                    value={formData.previouslyAttendedPrep}
                    onValueChange={(value) => setFormData({
                      ...formData,
                      previouslyAttendedPrep: value,
                      ...(value === 'false' ? { previousPrepLocation: '' } : {}),
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.previouslyAttendedPrep === 'true' && (
                  <div className="space-y-2">
                    <Label htmlFor="previousPrepLocation">Where did you attend? *</Label>
                    <Input
                      id="previousPrepLocation"
                      required
                      placeholder="Servants Prep program or church"
                      value={formData.previousPrepLocation}
                      onChange={(e) =>
                        setFormData({ ...formData, previousPrepLocation: e.target.value })
                      }
                    />
                  </div>
                )}
              </div>

              {/* Academic Information */}
              <div className="space-y-4">
                <h3 className="border-b border-line pb-2 text-sm font-semibold tracking-[0.04em] text-accent-ink uppercase">Academic Information</h3>
                <div className="space-y-2">
                  <Label htmlFor="grade">Which Grade are you in? *</Label>
                  <Select
                    required
                    value={formData.grade}
                    onValueChange={(value) => setFormData({ ...formData, grade: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select your grade..." />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(StudentGrade).map((grade) => (
                        <SelectItem key={grade} value={grade}>
                          {getGradeDisplayName(grade)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                <Button
                  type="submit"
                  disabled={isSubmitting || isUploadingProfilePic || !formData.profileImageUrl}
                  className="w-full"
                  size="lg"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting…
                    </>
                  ) : (
                    'Submit registration'
                  )}
                </Button>
                <p className="text-xs text-center text-gray-500 mt-2">
                  By submitting, you confirm that all information provided is accurate.
                </p>
              </div>
            </form>
    </PublicFrame>
  )
}
