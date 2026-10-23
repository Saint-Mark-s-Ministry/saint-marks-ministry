'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { PublicFrame, Field } from '@/components/ds/public-frame'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function SundaySchoolRosterContactForm({ token, className, levelLabel }: {
  token: string
  className: string
  levelLabel: string
}) {
  const [form, setForm] = useState({ firstName: '', lastName: '', birthDate: '', cellPhone: '', guardianPhone: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const field = (name: keyof typeof form) => ({
    id: name, value: form[name], disabled: submitting,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [name]: event.target.value })),
  })

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/public/roster-signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...form }),
      })
      const body = await response.json()
      if (!response.ok) {
        setError(body.error || 'Could not submit your details. Ask a Sunday School servant for help.')
        return
      }
      setForm({ firstName: '', lastName: '', birthDate: '', cellPhone: '', guardianPhone: '' })
      setDone(true)
    } catch {
      setError('Could not submit your details. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PublicFrame
      width="lg"
      title={done ? 'Thank you' : 'Add missing phone details'}
      description={`${className} · ${levelLabel}`}
    >
      {done ? (
        <div className="space-y-4 text-center" role="status">
          <CheckCircle2 className="mx-auto size-10 text-good" aria-hidden />
          <p className="text-sm leading-relaxed text-ink-2">
            If your name and birth date match this class’s roster, your missing phone details have been saved.
            Existing numbers stay the same. Ask a servant to confirm your details or make a correction.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-ink-3">
            Enter your own details as they appear on the roster. This form only adds missing phone numbers for this class.
            If your birth date is missing from the roster, ask a servant for help.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name" htmlFor="firstName" required>
              <Input {...field('firstName')} autoComplete="given-name" required maxLength={100} />
            </Field>
            <Field label="Last name" htmlFor="lastName" required>
              <Input {...field('lastName')} autoComplete="family-name" required maxLength={100} />
            </Field>
          </div>
          <Field label="Date of birth" htmlFor="birthDate" required>
            <Input {...field('birthDate')} type="date" autoComplete="bday" required max={new Date().toISOString().slice(0, 10)} />
          </Field>
          <div className="space-y-4 rounded-lg border border-line p-4">
            <p className="text-sm font-medium text-ink-2">Add at least one phone number</p>
            <Field label="Your phone number" htmlFor="cellPhone">
              <Input {...field('cellPhone')} type="tel" autoComplete="tel" maxLength={50} placeholder="Including area or country code" />
            </Field>
            <Field label="Parent or guardian’s phone number" htmlFor="guardianPhone">
              <Input {...field('guardianPhone')} type="tel" autoComplete="off" maxLength={50} placeholder="Including area or country code" />
            </Field>
          </div>
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting || !form.firstName.trim() || !form.lastName.trim() || !form.birthDate || (!form.cellPhone.trim() && !form.guardianPhone.trim())}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            {submitting ? 'Submitting…' : 'Submit phone details'}
          </Button>
          <p className="text-center text-xs leading-relaxed text-ink-3">
            Existing contact details are never displayed or replaced. To change a saved number, ask a servant.
          </p>
        </form>
      )}
    </PublicFrame>
  )
}
