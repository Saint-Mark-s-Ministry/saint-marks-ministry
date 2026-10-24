import { getPasskeyConfig, PasskeyConfigError } from '@/lib/passkey-config'
import { passkeyJson } from '@/lib/passkey-api'

export function GET() {
  try {
    getPasskeyConfig()
    return passkeyJson({ enabled: true })
  } catch (error) {
    if (error instanceof PasskeyConfigError) {
      // Report failed checks, never raw environment values or exception text.
      return passkeyJson({ enabled: false, reason: error.reason, ...(error.missing ? { missing: error.missing } : {}) })
    }
    return passkeyJson({ enabled: false, reason: 'unavailable' }, 503)
  }
}
