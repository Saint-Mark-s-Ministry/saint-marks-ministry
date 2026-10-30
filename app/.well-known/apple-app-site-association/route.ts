import { NextResponse } from 'next/server'
import { getPasskeyConfig, getPasskeyIosAppIds } from '@/lib/passkey-config'

// Lets the iOS app use this deployment's passkeys (associated domains,
// `webcredentials`). Apple fetches this exact path on the RP ID host without
// following redirects, so the RP ID host must serve it directly. Nothing here is
// secret: it lists App IDs. It 404s unless passkeys and an iOS App ID are set.
export function GET() {
  try {
    getPasskeyConfig()
    const apps = getPasskeyIosAppIds()
    if (!apps.length) throw new Error('not enabled')
    return NextResponse.json({ webcredentials: { apps } }, { headers: { 'Cache-Control': 'public, max-age=3600' } })
  } catch { return new NextResponse(null, { status: 404 }) }
}
