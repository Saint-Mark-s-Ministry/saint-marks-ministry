/**
 * Account emails, one function per event. Each queues the send with after() so
 * the response never waits on Resend, and never throws.
 */
import { after } from 'next/server'
import { createPasswordToken, LINK_LIFETIME_MS, passwordLinkUrl } from '@/lib/password-reset'
import { appUrl, sendEmail, type EmailMessage } from './send'
import * as templates from './templates'

type Content = Omit<EmailMessage, 'to'>
type Recipient = { email: string; name: string }
type Account = Recipient & { id: string; authVersion: number }

/** Builds lazily inside the guard so a bad record can never fail the request. */
function queue(to: string, build: () => Content) {
  const send = async () => {
    try {
      await sendEmail({ ...build(), to })
    } catch (error) {
      console.error('[email] could not build message:', error instanceof Error ? error.message : error)
    }
  }
  try {
    after(send)
  } catch {
    // Outside a request (scripts, tests): send now, unawaited.
    void send()
  }
}

const signInUrl = () => `${appUrl()}/login`
const forgotUrl = () => `${appUrl()}/forgot-password`
const setupUrl = (user: Account) => passwordLinkUrl(appUrl(), createPasswordToken(user, 'setup'))

export const emailRegistrationReceived = (r: Recipient) => queue(r.email, () => templates.registrationReceived(r))

/** `account` is set for a newly created user, who gets a set-password link instead of a temporary password. */
export function emailRegistrationApproved(r: Recipient, account?: Account) {
  queue(r.email, () =>
    templates.registrationApproved({ name: r.name, signInUrl: signInUrl(), setPasswordUrl: account ? setupUrl(account) : undefined })
  )
}

export const emailRegistrationNotApproved = (r: Recipient) => queue(r.email, () => templates.registrationNotApproved(r))

export const emailServantApplicationReceived = (r: Recipient) => queue(r.email, () => templates.servantApplicationReceived(r))

export const emailServantApplicationApproved = (account: Account) =>
  queue(account.email, () => templates.servantApplicationApproved({ name: account.name, setPasswordUrl: setupUrl(account) }))

export const emailServantApplicationNotApproved = (r: Recipient) => queue(r.email, () => templates.servantApplicationNotApproved(r))

export const emailParentWelcome = (r: Recipient) => queue(r.email, () => templates.parentWelcome({ name: r.name, signInUrl: signInUrl() }))

export function emailPasswordReset(account: Account) {
  queue(account.email, () =>
    templates.passwordReset({
      name: account.name,
      resetUrl: passwordLinkUrl(appUrl(), createPasswordToken(account, 'reset')),
      expiresInMinutes: LINK_LIFETIME_MS.reset / 60_000,
    })
  )
}

/** Every password change bumps authVersion, which signs out all sessions. */
export const emailPasswordChanged = (r: Recipient) =>
  queue(r.email, () => templates.passwordChanged({ name: r.name, forgotUrl: forgotUrl(), signedOutElsewhere: true }))
