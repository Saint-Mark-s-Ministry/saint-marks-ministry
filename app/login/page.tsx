'use client'

import { Suspense, useState, useEffect } from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { PublicFrame, Field } from '@/components/ds/public-frame'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.166 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-dvh items-center justify-center bg-canvas text-[13px] text-ink-3">Loading…</div>
    }>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [clearingInvalidSession, setClearingInvalidSession] = useState(false)

  // Show error from URL params (e.g., Google sign-in rejection)
  useEffect(() => {
    const errorParam = searchParams.get('error')
    if (errorParam === 'GoogleSignInFailed') {
      setError('Unable to sign in with this Google account. Please use your credentials or contact an administrator.')
    }
  }, [searchParams])

  // Redirect if already authenticated
  useEffect(() => {
    if (status !== 'authenticated') return

    // A disabled, deleted, or auth-version-invalidated account deliberately
    // returns a session without a user. Clear its stale cookie so the visitor
    // can sign in again instead of remaining on "Redirecting..." forever.
    if (!session?.user) {
      if (clearingInvalidSession) return

      setClearingInvalidSession(true)
      void signOut({ redirect: false }).finally(() => {
        setClearingInvalidSession(false)
        router.replace('/login')
        router.refresh()
      })
      return
    }

    // Check if user needs to change password
    if (session.user.mustChangePassword) {
      router.push('/change-password')
    } else {
      router.push('/dashboard')
    }
  }, [status, session, router, clearingInvalidSession])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError('Invalid email or password')
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    } catch {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = () => {
    setError('')
    setGoogleLoading(true)
    signIn('google', { callbackUrl: '/dashboard' })
  }

  // Show loading state while checking session
  if (status === 'loading' || clearingInvalidSession) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas text-[13px] text-ink-3">Loading…</div>
    )
  }

  // Don't render login form if already authenticated (will redirect)
  if (status === 'authenticated' && session?.user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas text-[13px] text-ink-3">Redirecting…</div>
    )
  }

  return (
    <PublicFrame
      title="Sign in"
      badges={
        <>
          <span className="inline-flex h-[22px] items-center rounded-sm bg-accent-tint px-2 text-xs font-medium text-accent-ink">Servants Prep</span>
          <span className="inline-flex h-[22px] items-center rounded-sm bg-gold-tint px-2 text-xs font-medium text-gold">Sunday School</span>
        </>
      }
      description="Sign in once to access the ministries connected to your account."
    >
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
            disabled={loading || googleLoading}
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading || googleLoading}
          />
        </Field>
        <Link href="/forgot-password" className="-mt-2.5 self-end text-[13px] font-medium text-accent-ink no-underline hover:underline">
          Forgot password?
        </Link>
        {error && (
          <p role="alert" className="rounded-md bg-bad-tint px-3 py-2 text-[13px] text-bad">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={loading || googleLoading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="flex items-center gap-2.5 text-xs text-ink-3" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleGoogleSignIn} disabled={loading || googleLoading}>
        <GoogleIcon />
        {googleLoading ? 'Redirecting…' : 'Sign in with Google'}
      </Button>

      <div className="flex flex-col items-center gap-1.5 pt-1 text-[13.5px]">
        <span className="text-ink-3">New here?</span>
        <Link href="/signup/parent" className="font-medium text-accent-ink no-underline hover:underline">
          Register your child for Sunday School
        </Link>
        <Link href="/signup/servant" className="font-medium text-accent-ink no-underline hover:underline">
          Sign up as a Sunday School servant
        </Link>
      </div>
    </PublicFrame>
  )
}
