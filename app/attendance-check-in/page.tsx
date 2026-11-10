'use client'

import { useEffect, useState } from 'react'
import { PublicFrame, Field } from '@/components/ds/public-frame'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePublicAttendanceCheckIn } from '@/lib/swr'
import { formatDateUTC } from '@/lib/utils'

export default function AttendanceCheckInPage() {
  const [token, setToken] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [submitError, setSubmitError] = useState('')
  useEffect(() => { setToken(new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '') }, [])
  const { data, error, isLoading, mutate } = usePublicAttendanceCheckIn(token ?? '')
  const checkIn = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setSubmitError('')
    try {
      const response = await fetch('/api/public/attendance-check-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, name: name.trim() }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Please try again, or ask your servant for help.')
      setSent(true)
    } catch (error: unknown) { setSubmitError(error instanceof Error ? error.message : 'Please ask your servant for help.') }
    finally { setBusy(false) }
  }
  const opens = data ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(data.opensAt)) : ''
  return <PublicFrame title={data ? `Welcome, ${data.className}!` : 'Welcome to Sunday School!'} description="Let your servant know you’re here.">
    {token === null || isLoading ? <p role="status">Getting your class ready…</p>
      : !token ? <p role="alert">Scan the code on your classroom screen to check in.</p>
      : error ? <><p role="alert" className="text-sm text-danger">{error.message}</p><Button variant="outline" onClick={() => void mutate()}>Try again</Button></>
      : !data ? <p role="status">Getting your class ready…</p>
      : <>
        <p className="text-center text-sm text-ink-3">{formatDateUTC(data.date, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        {sent ? <div role="status" className="rounded-lg bg-ok-tint p-4 text-center"><h2 className="text-lg font-semibold text-ink">Thanks, {name.trim()}!</h2><p className="mt-2 text-sm text-ink-2">Show this screen to your servant so they can finish checking you in.</p><p className="mt-2 text-sm text-ink-3">You only need to do this once.</p></div>
          : data.state === 'upcoming' ? <p role="status" className="text-center text-sm text-ink-2">You’re a little early! Check-in opens {opens} (New York time).</p>
          : data.state === 'closed' ? <p role="status" className="text-center text-sm text-ink-2">Check-in has finished. Tell your servant you’re here and they’ll help you.</p>
          : <form onSubmit={checkIn} className="flex flex-col gap-4">
            <p className="text-sm text-ink-2">Type your first and last name, then tap “I’m here.” No account needed.</p>
            <Field label="Your full name" htmlFor="check-in-name"><Input id="check-in-name" autoComplete="name" placeholder="First and last name" value={name} onChange={event => setName(event.target.value)} maxLength={200} required disabled={busy} /></Field>
            <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'I’m here'}</Button>
            {submitError && <p role="alert" className="text-sm text-danger">{submitError}</p>}
          </form>}
        <p className="text-center text-sm text-ink-3">Need help? Ask your servant.</p>
      </>}
  </PublicFrame>
}
