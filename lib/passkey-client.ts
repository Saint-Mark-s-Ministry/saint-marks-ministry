'use client'

export async function passkeyRequest(url: string, body: unknown, method = 'POST') {
  const response = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Unable to complete the passkey request.')
  return data
}

export function passkeyClientError(error: unknown) {
  // DOMException objects can come from a different browser realm.
  const name = error && typeof error === 'object' && 'name' in error ? error.name : undefined
  if (name === 'NotAllowedError' || name === 'AbortError') {
    return 'Passkey request cancelled or timed out. You can try again or use another sign-in method.'
  }
  if (name === 'InvalidStateError') return 'This authenticator already has a passkey for your account.'
  return error instanceof Error ? error.message : 'Unable to use this passkey. Please try again.'
}
