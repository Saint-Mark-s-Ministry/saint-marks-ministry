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
