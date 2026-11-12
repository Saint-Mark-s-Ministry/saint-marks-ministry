'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePasskeyAvailability, usePasskeys } from '@/lib/swr'
import { passkeyRequest, passkeyClientError } from '@/lib/passkey-client'

export function PasskeySettings() {
  const { data: session } = useSession()
  const { data: availability, error: availabilityError, mutate: refreshAvailability } = usePasskeyAvailability()
  const { data, error, isLoading, mutate } = usePasskeys(availability?.enabled === true && !session?.impersonating)
  const [supported, setSupported] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [removeId, setRemoveId] = useState<string | null>(null)
  useEffect(() => { setSupported(browserSupportsWebAuthn()) }, [])

  if (session?.impersonating) return null

  if (!availability?.enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Passkeys</CardTitle>
          <CardDescription>Sign in with your fingerprint, face, device PIN, or security key.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!availability && !availabilityError ? (
            <p role="status" className="text-sm">Checking passkey availability…</p>
          ) : (
            <>
              <p role={availabilityError ? 'alert' : 'status'} className="text-sm text-muted-foreground">Passkey setup is currently unavailable. You can still sign in with your password or Google account.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void refreshAvailability()}>Check again</Button>
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  async function addPasskey(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const options = await passkeyRequest('/api/passkeys/registration/options', {})
      const response = await startRegistration({ optionsJSON: options })
      await passkeyRequest('/api/passkeys/registration/verify', { response, name: name.trim() })
      setName('')
      await mutate()
      toast.success('Passkey added. You can now use it to sign in.')
    } catch (error) { toast.error(passkeyClientError(error)) }
    finally { setBusy(false) }
  }

  async function removePasskey(id: string) {
    setBusy(true)
    try {
      await passkeyRequest('/api/passkeys', { id }, 'DELETE')
      setRemoveId(null)
      await mutate()
      toast.success('Passkey removed.')
    } catch (error) { toast.error(passkeyClientError(error)) }
    finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passkeys</CardTitle>
        <CardDescription>Sign in with your fingerprint, face, device PIN, or security key.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">To add or remove passkeys, sign in within the last 10 minutes. If asked, sign out and sign in again. Your password and Google sign-in remain available.</p>
        {isLoading && <p role="status" className="text-sm">Loading passkeys…</p>}
        {error && <p role="alert" className="text-sm text-destructive">Unable to load passkeys. <button type="button" className="underline" onClick={() => void mutate()}>Try again</button></p>}
        {data?.passkeys.length === 0 && <p className="text-sm text-muted-foreground">You haven’t added a passkey yet.</p>}
        <ul className="space-y-3">
          {data?.passkeys.map(key => (
            <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <p className="font-medium">{key.name}</p>
                <p className="text-xs text-muted-foreground">Added {new Date(key.createdAt).toLocaleDateString()}{key.lastUsedAt ? ` · Last used ${new Date(key.lastUsedAt).toLocaleDateString()}` : ' · Not used yet'}</p>
              </div>
              {removeId === key.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm">Remove this passkey?</span>
                  <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => void removePasskey(key.id)}>Remove</Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setRemoveId(null)}>Cancel</Button>
                </div>
              ) : <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setRemoveId(key.id)} aria-label={`Remove ${key.name}`}>Remove</Button>}
            </li>
          ))}
        </ul>
        {supported ? (
          <form onSubmit={addPasskey} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="passkey-name">Passkey name</Label>
              <Input id="passkey-name" placeholder="e.g. My iPhone" value={name} onChange={e => setName(e.target.value)} maxLength={80} required disabled={busy} />
            </div>
            <Button type="submit" disabled={busy || !name.trim() || !data || data.passkeys.length >= 10}>
              <KeyRound className="size-4" />{busy ? 'Please wait…' : 'Add a passkey'}
            </Button>
          </form>
        ) : <p className="text-sm text-muted-foreground">To add a passkey, use a browser and device that support passkeys over a secure connection.</p>}
      </CardContent>
    </Card>
  )
}
