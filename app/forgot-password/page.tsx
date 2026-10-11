'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, PublicFrame } from '@/components/ds/public-frame'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Something went wrong. Please try again.')
      }
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <PublicFrame
        title="Check your email"
        description={
          <>
            If an account exists for <strong className="text-ink">{email}</strong>, we sent a link to reset its password. The link works
            for one hour.
          </>
        }
      >
        <p className="text-center text-[13px] text-ink-3">Nothing arrived? Check your spam folder, or try again in a few minutes.</p>
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </PublicFrame>
    )
  }

  return (
    <PublicFrame title="Forgot password?" description="Enter the email you sign in with and we’ll send you a link to choose a new password.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
        </Field>
        {error && (
          <p role="alert" className="rounded-md bg-bad-tint px-3 py-2 text-[13px] text-bad">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
      <Link href="/login" className="text-center text-[13.5px] font-medium text-accent-ink no-underline hover:underline">
        Back to sign in
      </Link>
    </PublicFrame>
  )
}
