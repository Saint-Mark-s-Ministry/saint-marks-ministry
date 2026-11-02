import { getPasskeyConfig, getPasskeyIosAppIds } from '@/lib/passkey-config'
import { passkeyJson } from '@/lib/passkey-api'

// Public capability check. `rpId` and `ios` are additive: the web login ignores
// them, and the native app uses them to offer passkeys only when this
// deployment's association file names its App ID.
export function GET() {
  try {
    const { rpID } = getPasskeyConfig()
    let ios = false
    try { ios = getPasskeyIosAppIds().length > 0 } catch { /* a bad iOS list never disables web passkeys */ }
    return passkeyJson({ enabled: true, rpId: rpID, ios })
  } catch { return passkeyJson({ enabled: false }) }
}
