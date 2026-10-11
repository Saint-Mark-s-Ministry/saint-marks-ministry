'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PublicFrame } from '@/components/ds/public-frame'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, Loader2 } from 'lucide-react'

/**
 * PUBLIC. The page a family lands on after scanning a class's sign-up QR code.
 *
 * The token in the URL is the only thing that decides which roster this fills.
 * Nothing here lets the visitor choose a class or a grade, and the page never
 * shows any other child's details.
 */

interface LinkInfo {
  className: string
  levelLabel: string
  label: string | null
  expiresAt: string
}

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  gender: '',
  birthDate: '',
  guardianName: '',
  guardianPhone: '',
  guardianEmail: '',
  notes: '',
}

export default function RosterSignupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)

  const [info, setInfo] = useState<LinkInfo | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [done, setDone] = useState<{ firstName: string; needsServantReview: boolean } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/public/roster-signup?token=${encodeURIComponent(token)}`)
      const body = await response.json()
      if (!response.ok) {
        setLoadError(body.error || 'This sign-up link is not valid.')
        return
      }
      setInfo(body as LinkInfo)
    } catch {
      setLoadError('Could not open this sign-up link. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError('')
    try {
      const response = await fetch('/api/public/roster-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...form }),
      })
      const body = await response.json()
      if (!response.ok) {
        setSubmitError(body.error || 'Could not save this sign-up.')
        return
      }
      setDone({ firstName: body.firstName, needsServantReview: Boolean(body.needsServantReview) })
    } catch {
      setSubmitError('Could not save this sign-up. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PublicFrame width="lg" className="gap-0 p-0 md:p-0 [&_[data-slot=card-title]]:font-display [&_[data-slot=card-title]]:text-[28px] [&_[data-slot=card-title]]:font-medium">
        {loading ? (
          <CardContent className="flex items-center justify-center gap-2 py-16 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Opening sign-up…
          </CardContent>
        ) : loadError ? (
          <>
            <CardHeader className="space-y-3 pt-8 text-center">
              <CardTitle className="text-2xl">Sign-up unavailable</CardTitle>
              <CardDescription className="text-base">{loadError}</CardDescription>
            </CardHeader>
            <CardContent className="pb-8" />
          </>
        ) : done ? (
          <>
            <CardHeader className="space-y-3 pt-8 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
              <CardTitle className="text-2xl">You&apos;re signed up</CardTitle>
              <CardDescription className="text-base">
                {done.firstName} has been added to {info?.className}.
                {done.needsServantReview
                  ? ' A Sunday School servant will confirm the grade with you.'
                  : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-8 text-center">
              <Button
                variant="outline"
                onClick={() => {
                  setForm(EMPTY_FORM)
                  setDone(null)
                  void load()
                }}
              >
                Sign up another child
              </Button>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader className="space-y-2 pt-8 text-center">
              <CardTitle className="text-2xl">{info?.className}</CardTitle>
              <CardDescription className="text-base">
                {info?.levelLabel} · Sunday School sign-up
                {info?.label ? ` · ${info.label}` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 px-6 pb-8">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">Student first name *</Label>
                    <Input
                      id="firstName"
                      required
                      maxLength={100}
                      autoComplete="given-name"
                      value={form.firstName}
                      onChange={e => setForm(prev => ({ ...prev, firstName: e.target.value }))}
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Student last name *</Label>
                    <Input
                      id="lastName"
                      required
                      maxLength={100}
                      autoComplete="family-name"
                      value={form.lastName}
                      onChange={e => setForm(prev => ({ ...prev, lastName: e.target.value }))}
                      disabled={submitting}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="gender">Gender</Label>
                    <select
                      id="gender"
                      value={form.gender}
                      onChange={e => setForm(prev => ({ ...prev, gender: e.target.value }))}
                      disabled={submitting}
                      className="h-9 w-full rounded-md border bg-transparent px-3 text-sm dark:border-gray-700"
                    >
                      <option value="">Not specified</option>
                      <option value="MALE">Boy</option>
                      <option value="FEMALE">Girl</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="birthDate">Date of birth</Label>
                    <Input
                      id="birthDate"
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      value={form.birthDate}
                      onChange={e => setForm(prev => ({ ...prev, birthDate: e.target.value }))}
                      disabled={submitting}
                    />
                  </div>
                </div>

                <div className="space-y-4 rounded-lg border p-4 dark:border-gray-700">
                  <p className="text-sm font-medium">Parent or guardian</p>
                  <div className="space-y-2">
                    <Label htmlFor="guardianName">Name</Label>
                    <Input
                      id="guardianName"
                      maxLength={200}
                      value={form.guardianName}
                      onChange={e => setForm(prev => ({ ...prev, guardianName: e.target.value }))}
                      disabled={submitting}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="guardianPhone">Phone</Label>
                      <Input
                        id="guardianPhone"
                        type="tel"
                        maxLength={50}
                        autoComplete="tel"
                        value={form.guardianPhone}
                        onChange={e => setForm(prev => ({ ...prev, guardianPhone: e.target.value }))}
                        disabled={submitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="guardianEmail">Email</Label>
                      <Input
                        id="guardianEmail"
                        type="email"
                        value={form.guardianEmail}
                        onChange={e => setForm(prev => ({ ...prev, guardianEmail: e.target.value }))}
                        disabled={submitting}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Anything the servants should know</Label>
                  <Textarea
                    id="notes"
                    rows={3}
                    maxLength={2000}
                    placeholder="Allergies, and anything else we should be aware of"
                    value={form.notes}
                    onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                    disabled={submitting}
                  />
                </div>

                {submitError && <p className="text-sm text-red-600">{submitError}</p>}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={submitting || !form.firstName.trim() || !form.lastName.trim()}
                >
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {submitting ? 'Saving…' : 'Join this class'}
                </Button>
              </form>

              <p className="text-center text-xs text-gray-500">
                Your details go only to the servants of this class.
              </p>
            </CardContent>
          </>
        )}
    </PublicFrame>
  )
}
