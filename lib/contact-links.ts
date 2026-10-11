/**
 * Builds platform-appropriate "smart links" for contacting someone: call, text,
 * FaceTime, email, or directions. Pure functions so they can be unit tested;
 * the platform is detected once on the client by `detectContactPlatform`.
 */

export type ContactPlatform = 'ios' | 'android' | 'mac' | 'desktop'

export interface PlatformSignals {
  userAgent: string
  /** `navigator.platform`, used to tell an iPad in desktop mode from a real Mac. */
  platform?: string
  maxTouchPoints?: number
}

export function detectContactPlatform({ userAgent, platform = '', maxTouchPoints = 0 }: PlatformSignals): ContactPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios'
  // iPadOS 13+ requests the desktop site and reports itself as a Mac; only the touch screen gives it away.
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios'
  if (/Android/i.test(userAgent)) return 'android'
  if (/Mac/i.test(platform) || /Macintosh/i.test(userAgent)) return 'mac'
  return 'desktop'
}

/** Phones and tablets get an action sheet; desktops get a dropdown next to the value. */
export function isMobileContactPlatform(platform: ContactPlatform) {
  return platform === 'ios' || platform === 'android'
}

/**
 * Reduce a human-entered number ("(555) 123-4567 ext. 9") to something a dialer
 * accepts. Keeps a leading "+" and digits; an extension becomes ",<digits>" so
 * the phone pauses and dials it after the call connects.
 */
export function normalizePhoneForDialing(phone: string): string | null {
  const trimmed = phone.trim()
  if (!trimmed) return null

  const extensionMatch = trimmed.match(/^(.*?)(?:\s*(?:ext\.?|extension|x|#)\s*(\d+))$/i)
  const main = extensionMatch ? extensionMatch[1] : trimmed
  const extension = extensionMatch?.[2]

  const digits = main.replace(/\D/g, '')
  if (digits.length < 3) return null

  const prefix = main.trimStart().startsWith('+') ? '+' : ''
  return `${prefix}${digits}${extension ? `,${extension}` : ''}`
}

/** The number without an extension: messaging and FaceTime can't dial one. */
function messagingNumber(phone: string) {
  const dial = normalizePhoneForDialing(phone)
  return dial ? dial.split(',')[0] : null
}

export function telHref(phone: string) {
  const dial = normalizePhoneForDialing(phone)
  return dial ? `tel:${dial}` : null
}

/**
 * iOS and Android disagree on how a prefilled body is attached ("&body=" vs
 * "?body="); without a body both accept a bare `sms:<number>`.
 */
export function smsHref(phone: string, platform: ContactPlatform, body?: string) {
  const number = messagingNumber(phone)
  if (!number) return null
  if (!body) return `sms:${number}`
  const separator = platform === 'ios' ? '&' : '?'
  return `sms:${number}${separator}body=${encodeURIComponent(body)}`
}

export function faceTimeHref(phone: string, kind: 'video' | 'audio' = 'video') {
  const number = messagingNumber(phone)
  if (!number) return null
  return `${kind === 'audio' ? 'facetime-audio' : 'facetime'}:${number}`
}

export function mailtoHref(email: string, options: { subject?: string } = {}) {
  const address = email.trim()
  if (!address || !address.includes('@')) return null
  // Keep "@" readable; encode anything that could break out of the address.
  const encoded = encodeURIComponent(address).replace(/%40/g, '@')
  return options.subject ? `mailto:${encoded}?subject=${encodeURIComponent(options.subject)}` : `mailto:${encoded}`
}

/** Apple Maps on Apple devices (it hands off to the Maps app), Google Maps everywhere else. */
export function mapsHref(address: string, platform: ContactPlatform) {
  const query = address.trim()
  if (!query) return null
  const encoded = encodeURIComponent(query)
  return platform === 'ios' || platform === 'mac'
    ? `https://maps.apple.com/?q=${encoded}`
    : `https://www.google.com/maps/search/?api=1&query=${encoded}`
}

export type ContactKind = 'phone' | 'email' | 'address'

export type ContactActionId = 'call' | 'text' | 'facetime' | 'facetime-audio' | 'email' | 'directions' | 'copy'

export interface ContactAction {
  id: ContactActionId
  label: string
  href?: string
}

/**
 * The actions offered for a value, in the order they should appear. Labels use
 * each platform's own vocabulary ("Message" on Apple devices, "Text" elsewhere).
 */
export function getContactActions(kind: ContactKind, value: string, platform: ContactPlatform): ContactAction[] {
  const actions: ContactAction[] = []
  const add = (id: ContactActionId, label: string, href: string | null) => {
    if (href) actions.push({ id, label, href })
  }

  if (kind === 'phone') {
    const apple = platform === 'ios' || platform === 'mac'
    add('call', platform === 'mac' ? 'Call with iPhone' : 'Call', telHref(value))
    // A Windows/Linux browser has no reliable SMS handler, so only offer texting where one exists.
    if (platform !== 'desktop') add('text', apple ? 'Message' : 'Text', smsHref(value, platform))
    if (apple) {
      add('facetime', 'FaceTime', faceTimeHref(value, 'video'))
      add('facetime-audio', 'FaceTime Audio', faceTimeHref(value, 'audio'))
    }
  } else if (kind === 'email') {
    add('email', 'Send Email', mailtoHref(value))
  } else {
    add('directions', platform === 'ios' || platform === 'mac' ? 'Open in Maps' : 'Open in Google Maps', mapsHref(value, platform))
  }

  actions.push({ id: 'copy', label: kind === 'phone' ? 'Copy Number' : kind === 'email' ? 'Copy Email' : 'Copy Address' })
  return actions
}
