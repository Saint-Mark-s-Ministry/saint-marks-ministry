import { NextRequest } from 'next/server'
import { authenticationOptions, limitPasskeyRequests } from '@/lib/passkeys'
import { challengeResponse, passkeyApiError, passkeyBody } from '@/lib/passkey-api'

export async function POST(req: NextRequest) {
  try {
    await passkeyBody(req)
    // Vercel overwrites x-forwarded-for. Do not accept a client-supplied email
    // or return account-specific credential lists from this public endpoint.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    await limitPasskeyRequests(`options:${ip}`)
    const { options, token } = await authenticationOptions()
    return challengeResponse(options, token, 'authenticate')
  } catch (error) { return passkeyApiError(error) }
}
