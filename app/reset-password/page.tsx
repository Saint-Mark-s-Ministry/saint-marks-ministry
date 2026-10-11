'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, PublicFrame } from '@/components/ds/public-frame'

const MIN_LENGTH = 8

/** Display only: the server verifies the signature. */
function isSetupLink(token: string) {
  try {
    const json = atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json).p === 'setup'
  } catch {
    return false
  }
}

function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? ''
  const setup = isSetupLink(token)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < MIN_LENGTH) return setError(`Password must be at least ${MIN_LENGTH} characters.`)
    if (password !== confirm) return setError('The passwords don’t match.')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <PublicFrame title="Link incomplete" description="This page needs the link from your email. Open the link again, or request a new one.">
        <Button asChild size="lg" className="w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </PublicFrame>
    )
  }

  if (done) {
    return (
      <PublicFrame title="Password saved" description="Your password is set. Sign in with your email and new password.">
        <Button asChild size="lg" className="w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </PublicFrame>
    )
  }

  return (
    <PublicFrame
      title={setup ? 'Set your password' : 'Choose a new password'}
      description={`Use at least ${MIN_LENGTH} characters. ${setup ? '' : 'Every device signed in to your account will be signed out.'}`.trim()}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
        <Field label="New password" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm">
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            disabled={loading}
          />
        </Field>
        {error && (
          <p role="alert" className="rounded-md bg-bad-tint px-3 py-2 text-[13px] text-bad">
            {error}{' '}
            {error.includes('expired') && (
              <Link href="/forgot-password" className="font-medium text-bad underline">
                Get a new link
              </Link>
            )}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? 'Saving…' : 'Save password'}
        </Button>
      </form>
    </PublicFrame>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center bg-canvas text-[13px] text-ink-3">Loading…</div>}>
      <ResetPasswordForm />
    </Suspense>
  )
}
