import { getPasskeyConfig } from '@/lib/passkey-config'
import { passkeyJson } from '@/lib/passkey-api'

export function GET() {
  try {
    getPasskeyConfig()
    return passkeyJson({ enabled: true })
  } catch { return passkeyJson({ enabled: false }) }
}
