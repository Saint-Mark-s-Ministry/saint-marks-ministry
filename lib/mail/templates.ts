/**
 * Email content. Each builder returns subject + HTML + plain text; the HTML is
 * table-based with inline styles because many mail clients ignore <style>.
 * Everything a user typed (names, notes) goes through escapeHtml.
 */
import type { EmailMessage } from './send'

type Content = Omit<EmailMessage, 'to'>

const BRAND = '#800020'
const INK = '#1B1817'
const MUTED = '#736B65'
const CANVAS = '#F5F3F0'
const BORDER = '#E6E1DB'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface LayoutInput {
  preheader: string
  heading: string
  paragraphs: string[] // already-escaped HTML fragments
  action?: { label: string; url: string }
  footnote?: string // already-escaped
}

function layout({ preheader, heading, paragraphs, action, footnote }: LayoutInput): string {
  const button = action
    ? `<tr><td style="padding:8px 0 4px"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;line-height:20px;padding:12px 20px;border-radius:6px">${escapeHtml(action.label)}</a></td></tr>
       <tr><td style="padding:12px 0 0;font-size:12px;line-height:18px;color:${MUTED}">If the button doesn’t work, paste this link into your browser:<br><a href="${escapeHtml(action.url)}" style="color:${BRAND};word-break:break-all">${escapeHtml(action.url)}</a></td></tr>`
    : ''
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:${CANVAS};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};padding:32px 16px">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
    <tr><td style="padding:0 4px 16px;font-family:Georgia,'Times New Roman',serif;font-size:19px;color:${INK}">St. Mark Ministry Portal</td></tr>
    <tr><td style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;padding:28px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:30px;color:${INK};padding-bottom:12px">${escapeHtml(heading)}</td></tr>
        ${paragraphs.map((p) => `<tr><td style="font-size:15px;line-height:23px;color:${INK};padding-bottom:12px">${p}</td></tr>`).join('')}
        ${button}
      </table>
    </td></tr>
    <tr><td style="padding:16px 4px 0;font-size:12px;line-height:18px;color:${MUTED}">${footnote ?? 'Coptic Orthodox Church of Saint Mark · Jersey City, NJ'}<br>You received this because of activity on your St. Mark Ministry Portal account.</td></tr>
  </table>
</td></tr></table>
</body></html>`
}

function text(lines: (string | false | undefined)[]): string {
  return [...lines.filter(Boolean), '', '— St. Mark Ministry Portal', 'Coptic Orthodox Church of Saint Mark · Jersey City, NJ'].join('\n')
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'there'

// ------------------------------------------------------------ Servants Prep registration

export function registrationReceived({ name }: { name: string }): Content {
  const hi = `Hi ${escapeHtml(firstName(name))},`
  return {
    tag: 'registration-received',
    subject: 'We received your Servants Prep registration',
    html: layout({
      preheader: 'Your registration is under review.',
      heading: 'Registration received',
      paragraphs: [
        hi,
        'Thank you for registering for Servants Prep. Our Servants Prep servants will review your registration and let you know once a decision is made.',
        'There’s nothing else you need to do right now.',
      ],
    }),
    text: text([
      `Hi ${firstName(name)},`,
      '',
      'Thank you for registering for Servants Prep. Our Servants Prep servants will review your registration and let you know once a decision is made.',
      'There’s nothing else you need to do right now.',
    ]),
  }
}

export function registrationApproved({
  name,
  setPasswordUrl,
  signInUrl,
}: {
  name: string
  /** New accounts set their own password through this link. */
  setPasswordUrl?: string
  signInUrl: string
}): Content {
  const action = setPasswordUrl
    ? { label: 'Set your password', url: setPasswordUrl }
    : { label: 'Sign in', url: signInUrl }
  const next = setPasswordUrl
    ? 'Set a password to sign in, then finish the rest of your application from your dashboard. The link works for 7 days.'
    : 'Sign in with your existing account to see your updated enrollment.'
  return {
    tag: 'registration-approved',
    subject: 'Your Servants Prep registration was approved',
    html: layout({
      preheader: 'Welcome to Servants Prep.',
      heading: 'You’re in',
      paragraphs: [`Hi ${escapeHtml(firstName(name))},`, 'Your Servants Prep registration was approved. Welcome!', next],
      action,
    }),
    text: text([`Hi ${firstName(name)},`, '', 'Your Servants Prep registration was approved. Welcome!', next, '', `${action.label}: ${action.url}`]),
  }
}

export function registrationNotApproved({ name }: { name: string }): Content {
  return {
    tag: 'registration-not-approved',
    subject: 'About your Servants Prep registration',
    html: layout({
      preheader: 'An update on your registration.',
      heading: 'Registration update',
      paragraphs: [
        `Hi ${escapeHtml(firstName(name))},`,
        'Thank you for your interest in Servants Prep. We weren’t able to approve your registration at this time.',
        'If you have questions, please reach out to your mentor servant or a Servants Prep servant at church.',
      ],
    }),
    text: text([
      `Hi ${firstName(name)},`,
      '',
      'Thank you for your interest in Servants Prep. We weren’t able to approve your registration at this time.',
      'If you have questions, please reach out to your mentor servant or a Servants Prep servant at church.',
    ]),
  }
}

// ------------------------------------------------------------ Sunday School sign-up

export function servantApplicationReceived({ name }: { name: string }): Content {
  return {
    tag: 'servant-application-received',
    subject: 'We received your Sunday School servant application',
    html: layout({
      preheader: 'Your application is under review.',
      heading: 'Application received',
      paragraphs: [
        `Hi ${escapeHtml(firstName(name))},`,
        'Thank you for offering to serve in Sunday School. An authorized servant will review your application, and we’ll email you when it’s approved.',
      ],
    }),
    text: text([
      `Hi ${firstName(name)},`,
      '',
      'Thank you for offering to serve in Sunday School. An authorized servant will review your application, and we’ll email you when it’s approved.',
    ]),
  }
}

export function servantApplicationApproved({ name, setPasswordUrl }: { name: string; setPasswordUrl: string }): Content {
  return {
    tag: 'servant-application-approved',
    subject: 'Welcome to Sunday School — set your password',
    html: layout({
      preheader: 'Your servant application was approved.',
      heading: 'You’re approved to serve',
      paragraphs: [
        `Hi ${escapeHtml(firstName(name))},`,
        'Your Sunday School servant application was approved. Set a password to sign in. You’ll be assigned to a class once staffing is final.',
        'The link works for 7 days. After that, use “Forgot password?” on the sign-in page.',
      ],
      action: { label: 'Set your password', url: setPasswordUrl },
    }),
    text: text([
      `Hi ${firstName(name)},`,
      '',
      'Your Sunday School servant application was approved. Set a password to sign in. You’ll be assigned to a class once staffing is final.',
      '',
      `Set your password: ${setPasswordUrl}`,
      'The link works for 7 days. After that, use “Forgot password?” on the sign-in page.',
    ]),
  }
}

export function servantApplicationNotApproved({ name }: { name: string }): Content {
  return {
    tag: 'servant-application-not-approved',
    subject: 'About your Sunday School servant application',
    html: layout({
      preheader: 'An update on your application.',
      heading: 'Application update',
      paragraphs: [
        `Hi ${escapeHtml(firstName(name))},`,
        'Thank you for offering to serve. We weren’t able to approve your application at this time. A Sunday School servant can tell you more.',
      ],
    }),
    text: text([
      `Hi ${firstName(name)},`,
      '',
      'Thank you for offering to serve. We weren’t able to approve your application at this time. A Sunday School servant can tell you more.',
    ]),
  }
}

export function parentWelcome({ name, signInUrl }: { name: string; signInUrl: string }): Content {
  return {
    tag: 'parent-welcome',
    subject: 'Welcome to the St. Mark Ministry Portal',
    html: layout({
      preheader: 'Your parent account is ready.',
      heading: 'Your account is ready',
      paragraphs: [
        `Hi ${escapeHtml(firstName(name))},`,
        'Your parent account was created. Sign in to register your children for Sunday School and see the lessons their classes share.',
      ],
      action: { label: 'Sign in', url: signInUrl },
    }),
    text: text([
      `Hi ${firstName(name)},`,
      '',
      'Your parent account was created. Sign in to register your children for Sunday School and see the lessons their classes share.',
      '',
      `Sign in: ${signInUrl}`,
    ]),
  }
}

// ------------------------------------------------------------ Passwords

export function passwordReset({ name, resetUrl, expiresInMinutes }: { name: string; resetUrl: string; expiresInMinutes: number }): Content {
  return {
    tag: 'password-reset',
    subject: 'Reset your St. Mark Ministry Portal password',
    html: layout({
      preheader: 'Use this link to choose a new password.',
      heading: 'Reset your password',
      paragraphs: [
        `Hi ${escapeHtml(firstName(name))},`,
        `Someone asked to reset the password for your account. If it was you, choose a new password below. The link works for ${expiresInMinutes} minutes and only once.`,
      ],
      action: { label: 'Choose a new password', url: resetUrl },
      footnote: 'If you didn’t ask for this, you can ignore this email — your password won’t change.',
    }),
    text: text([
      `Hi ${firstName(name)},`,
      '',
      `Someone asked to reset the password for your account. If it was you, choose a new password here (works for ${expiresInMinutes} minutes, once):`,
      resetUrl,
      '',
      'If you didn’t ask for this, ignore this email — your password won’t change.',
    ]),
  }
}

export function passwordChanged({ name, forgotUrl, signedOutElsewhere }: { name: string; forgotUrl: string; signedOutElsewhere: boolean }): Content {
  const changed = signedOutElsewhere
    ? 'The password for your St. Mark Ministry Portal account was just changed, and every device signed in to it was signed out.'
    : 'The password for your St. Mark Ministry Portal account was just changed.'
  return {
    tag: 'password-changed',
    subject: 'Your password was changed',
    html: layout({
      preheader: 'A security notice for your account.',
      heading: 'Your password was changed',
      paragraphs: [
        `Hi ${escapeHtml(firstName(name))},`,
        changed,
        'If you didn’t do this, reset your password right away and tell a ministry servant.',
      ],
      action: { label: 'Reset password', url: forgotUrl },
    }),
    text: text([
      `Hi ${firstName(name)},`,
      '',
      changed,
      `If you didn’t do this, reset it right away: ${forgotUrl}`,
    ]),
  }
}
