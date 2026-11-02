// Explicit configuration keeps preview URLs from silently becoming permanent
// passkey identities. Never derive these values from request/forwarded headers.
export class PasskeyError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export function getPasskeyConfig() {
  const rpID = process.env.PASSKEY_RP_ID
  const originValue = process.env.PASSKEY_ORIGIN
  if (!rpID || !originValue) throw new PasskeyError('Passkeys are not enabled.', 503)
  let url: URL
  try { url = new URL(originValue) } catch { throw new PasskeyError('Invalid passkey configuration.', 503) }
  if (
    url.origin !== originValue ||
    url.username || url.password ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) ||
    !(url.hostname === rpID || url.hostname.endsWith(`.${rpID}`)) ||
    rpID.includes('/') || rpID.includes(':') ||
    (!rpID.includes('.') && rpID !== 'localhost')
  ) throw new PasskeyError('Invalid passkey configuration.', 503)
  return { rpID, origin: url.origin, secure: url.protocol === 'https:' }
}

// Apple App IDs ("TEAMID.bundle.id") that may use this deployment's passkeys
// through the associated-domains `webcredentials` service. Unset means the
// native iOS app is not enabled; web passkeys are unaffected.
const IOS_APP_ID = /^[A-Z0-9]{10}\.[A-Za-z0-9][A-Za-z0-9.-]*$/
export function getPasskeyIosAppIds() {
  const ids = (process.env.PASSKEY_IOS_APP_IDS ?? '').split(/[\s,]+/).filter(Boolean)
  if (!ids.length) return []
  if (!ids.every(id => IOS_APP_ID.test(id))) throw new PasskeyError('Invalid passkey configuration.', 503)
  return [...new Set(ids)]
}

// What the browser or platform embeds in clientDataJSON. Native iOS reports
// `https://<rpID>`, whichever host the API is served from, so it is accepted
// only when an iOS app is enabled. When the RP ID is also the web origin's host
// (the recommended setup) the list has one entry.
export function expectedPasskeyOrigins() {
  const { rpID, origin } = getPasskeyConfig()
  return [...new Set(getPasskeyIosAppIds().length ? [origin, `https://${rpID}`] : [origin])]
}

export function assertPasskeyOrigin(origin: string | null | undefined) {
  if (origin !== getPasskeyConfig().origin) throw new PasskeyError('Forbidden', 403)
}

export const PASSKEY_RECENT_LOGIN_MS = 10 * 60 * 1000

export function assertRecentPasskeyLogin(authenticatedAt: number | undefined) {
  const age = Date.now() - (authenticatedAt ?? 0)
  if (!authenticatedAt || age < 0 || age > PASSKEY_RECENT_LOGIN_MS) {
    throw new PasskeyError('For your security, sign out and sign in again before managing passkeys.', 403)
  }
}
