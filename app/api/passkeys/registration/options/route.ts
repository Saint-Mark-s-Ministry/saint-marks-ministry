import { NextRequest } from 'next/server'
import { registrationOptions, limitPasskeyRequests } from '@/lib/passkeys'
import { challengeResponse, passkeyApiError, passkeyBody, requirePasskeyOwner } from '@/lib/passkey-api'

export async function POST(req: NextRequest) {
  try {
    await passkeyBody(req)
    const user = await requirePasskeyOwner(true)
    await limitPasskeyRequests(`register:${user.id}`, 10)
    const { options, token } = await registrationOptions(user)
    return challengeResponse(options, token, 'register')
  } catch (error) { return passkeyApiError(error) }
}
