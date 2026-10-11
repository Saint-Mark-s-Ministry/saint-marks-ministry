'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PublicFrame } from '@/components/ds/public-frame'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { CheckCircle2, Loader2 } from 'lucide-react'

interface FormData {
  fullName: string
  email: string
  phone: string
  currentGrade: string
}

export default function ServantSignupPage() {
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    fullName: '',
    email: '',
    phone: '',
    currentGrade: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/servant-applications/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          currentGrade: formData.currentGrade,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Submission failed')
      }

      setSubmitted(true)
      toast.success('Application submitted successfully!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit application')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <PublicFrame
        title="Application submitted"
        description="Your application to serve in Sunday School was received and is under review."
        width="lg"
      >
        <div className="flex justify-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-ok-tint text-ok">
            <CheckCircle2 className="size-8" aria-hidden />
          </span>
        </div>
        <div className="rounded-md bg-raised px-4 py-3 text-[13px]">
          <p className="mb-1.5 font-semibold text-ink">What happens next</p>
          <ul className="list-inside list-disc space-y-1 text-ink-2">
            <li>A super admin reviews your application.</li>
            <li>We’ve emailed you a confirmation. If approved, you’ll get a link to set your password.</li>
            <li>You’re assigned to a class once staffing is final.</li>
          </ul>
        </div>
      </PublicFrame>
    )
  }

  return (
    <PublicFrame title="Servant sign up" description="Submit your information to request servant access. Applications require approval." width="lg">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name *</Label>
              <Input
                id="fullName"
                required
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email address *</Label>
              <Input
                id="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
            <div className="space-y-2">
              <Label htmlFor="currentGrade">What grade do you currently serve? *</Label>
              <Input
                id="currentGrade"
                placeholder="e.g. 3rd grade"
                required
                value={formData.currentGrade}
                onChange={(e) => setFormData({ ...formData, currentGrade: e.target.value })}
              />
            </div>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full"
              size="lg"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit for Approval'
              )}
            </Button>
          </form>
          <p className="text-center text-[13.5px] text-ink-3">
            Registering a child instead?{' '}
            <Link href="/signup/parent" className="font-medium text-accent-ink no-underline hover:underline">
              Sign up as a parent
            </Link>
          </p>
    </PublicFrame>
  )
}
