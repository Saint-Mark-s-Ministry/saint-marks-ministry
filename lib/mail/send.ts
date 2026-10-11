/**
 * Transactional email through Resend's HTTP API.
 *
 * Local development and preview deployments share the production database, so
 * only production (VERCEL_ENV=production, or EMAIL_DELIVERY=live) emails real
 * people. Everywhere else a message is sent only when every recipient is on the
 * allowlist — Resend's test inboxes (*@resend.dev) plus EMAIL_DEV_ALLOWLIST —
 * and is otherwise logged and skipped. Sending never throws: an email failure
 * must not fail the request that triggered it.
 */

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
  /** Groups messages in Resend's dashboard, e.g. "password-reset". */
  tag: string
}

export type SendResult =
  | { status: 'sent'; id: string }
  | { status: 'skipped'; reason: 'no-api-key' | 'not-allowlisted' }
  | { status: 'failed'; error: string }

const RESEND_URL = 'https://api.resend.com/emails'
export const DEFAULT_FROM = 'St. Mark Ministry <no-reply@stmarkministry.app>'

export function isLiveDelivery(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.EMAIL_DELIVERY === 'live' || (env.EMAIL_DELIVERY !== 'sandbox' && env.VERCEL_ENV === 'production')
}

export function isAllowlisted(address: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const email = address.trim().toLowerCase()
  if (email.endsWith('@resend.dev')) return true
  const extra = (env.EMAIL_DEV_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  // An entry starting with "@" allows a whole domain.
  return extra.some((entry) => (entry.startsWith('@') ? email.endsWith(entry) : email === entry))
}

/** Where links in emails point. */
export function appUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.APP_URL || env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

export async function sendEmail(message: EmailMessage, env: NodeJS.ProcessEnv = process.env): Promise<SendResult> {
  const apiKey = env.RESEND_API_KEY
  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY not set; skipped "${message.tag}" email`)
    return { status: 'skipped', reason: 'no-api-key' }
  }
  if (!isLiveDelivery(env) && !isAllowlisted(message.to, env)) {
    // Log the subject and a redacted recipient only; links can be tokens.
    console.warn(`[email] sandbox: skipped "${message.tag}" to ${redact(message.to)} (not allowlisted)`)
    return { status: 'skipped', reason: 'not-allowlisted' }
  }

  try {
    const response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.EMAIL_FROM || DEFAULT_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: [{ name: 'type', value: message.tag }],
      }),
    })
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string; name?: string }
    if (!response.ok || !body.id) {
      const error = `${response.status} ${body.name ?? ''} ${body.message ?? ''}`.trim()
      console.error(`[email] Resend rejected "${message.tag}": ${error}`)
      return { status: 'failed', error }
    }
    return { status: 'sent', id: body.id }
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error(`[email] could not reach Resend for "${message.tag}": ${reason}`)
    return { status: 'failed', error: reason }
  }
}

function redact(address: string) {
  const [user, domain] = address.split('@')
  return `${user.slice(0, 2)}…@${domain ?? ''}`
}
