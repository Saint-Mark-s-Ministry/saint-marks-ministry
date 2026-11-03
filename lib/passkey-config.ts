// Explicit configuration keeps preview URLs from silently becoming permanent
// passkey identities. Never derive these values from request/forwarded headers.
export class PasskeyError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export class PasskeyConfigError extends PasskeyError {
  constructor(
    public reason: 'missing_environment' | 'invalid_origin' | 'https_required' | 'invalid_rp_id' | 'rp_id_mismatch',
    public missing?: string[],
  ) {
    super(reason === 'missing_environment' ? 'Passkeys are not enabled.' : 'Invalid passkey configuration.', 503)
  }
}

export function getPasskeyConfig() {
  const rpID = process.env.PASSKEY_RP_ID?.trim().toLowerCase()
  const originValue = process.env.PASSKEY_ORIGIN?.trim()
  const missing = [!rpID && 'PASSKEY_RP_ID', !originValue && 'PASSKEY_ORIGIN'].filter((key): key is string => Boolean(key))
  if (!rpID || !originValue) throw new PasskeyConfigError('missing_environment', missing)
  let url: URL
  try { url = new URL(originValue) } catch { throw new PasskeyConfigError('invalid_origin') }
  // A root trailing slash and surrounding whitespace are harmless formatting;
  // paths, credentials, queries, and fragments are not valid origin settings.
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash || url.username || url.password) {
    throw new PasskeyConfigError('invalid_origin')
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) {
    throw new PasskeyConfigError('https_required')
  }
  const hostname = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
  if (rpID !== 'localhost' && (!hostname.test(rpID) || rpID.length > 253)) throw new PasskeyConfigError('invalid_rp_id')
  if (!(url.hostname === rpID || url.hostname.endsWith(`.${rpID}`))) throw new PasskeyConfigError('rp_id_mismatch')
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
