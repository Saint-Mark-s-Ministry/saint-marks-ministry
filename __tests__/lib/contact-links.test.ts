import { describe, expect, it } from 'vitest'
import {
  detectContactPlatform,
  faceTimeHref,
  getContactActions,
  mailtoHref,
  mapsHref,
  normalizePhoneForDialing,
  smsHref,
  telHref,
} from '@/lib/contact-links'

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

describe('detectContactPlatform', () => {
  it('recognizes iPhone, Android, Mac, and other desktops', () => {
    expect(detectContactPlatform({ userAgent: IPHONE_UA })).toBe('ios')
    expect(detectContactPlatform({ userAgent: ANDROID_UA })).toBe('android')
    expect(detectContactPlatform({ userAgent: MAC_UA, platform: 'MacIntel', maxTouchPoints: 0 })).toBe('mac')
    expect(detectContactPlatform({ userAgent: WINDOWS_UA, platform: 'Win32' })).toBe('desktop')
  })

  it('treats an iPad requesting the desktop site as iOS', () => {
    expect(detectContactPlatform({ userAgent: MAC_UA, platform: 'MacIntel', maxTouchPoints: 5 })).toBe('ios')
  })
})

describe('normalizePhoneForDialing', () => {
  it('strips formatting but keeps a leading plus', () => {
    expect(normalizePhoneForDialing('(555) 123-4567')).toBe('5551234567')
    expect(normalizePhoneForDialing(' +1 555.123.4567 ')).toBe('+15551234567')
  })

  it('turns an extension into a post-dial pause', () => {
    expect(normalizePhoneForDialing('555-123-4567 ext. 89')).toBe('5551234567,89')
    expect(normalizePhoneForDialing('555-123-4567 x12')).toBe('5551234567,12')
  })

  it('rejects values that are not a dialable number', () => {
    expect(normalizePhoneForDialing('')).toBeNull()
    expect(normalizePhoneForDialing('n/a')).toBeNull()
  })
})

describe('hrefs', () => {
  it('builds tel, sms, and FaceTime links', () => {
    expect(telHref('(555) 123-4567 ext 2')).toBe('tel:5551234567,2')
    expect(smsHref('(555) 123-4567 ext 2', 'ios')).toBe('sms:5551234567')
    expect(faceTimeHref('+1 555 123 4567')).toBe('facetime:+15551234567')
    expect(faceTimeHref('+1 555 123 4567', 'audio')).toBe('facetime-audio:+15551234567')
  })

  it('uses each platform’s body separator for a prefilled text', () => {
    expect(smsHref('5551234567', 'ios', 'Hi there')).toBe('sms:5551234567&body=Hi%20there')
    expect(smsHref('5551234567', 'android', 'Hi there')).toBe('sms:5551234567?body=Hi%20there')
  })

  it('builds mailto links without letting the address inject headers', () => {
    expect(mailtoHref(' mom@example.com ')).toBe('mailto:mom@example.com')
    expect(mailtoHref('a@b.com?cc=x@y.com')).toBe('mailto:a@b.com%3Fcc%3Dx@y.com')
    expect(mailtoHref('a@b.com', { subject: 'Sunday School' })).toBe('mailto:a@b.com?subject=Sunday%20School')
    expect(mailtoHref('not-an-email')).toBeNull()
  })

  it('opens Apple Maps on Apple devices and Google Maps elsewhere', () => {
    expect(mapsHref('1 Main St, Town', 'ios')).toBe('https://maps.apple.com/?q=1%20Main%20St%2C%20Town')
    expect(mapsHref('1 Main St', 'android')).toBe('https://www.google.com/maps/search/?api=1&query=1%20Main%20St')
  })
})

describe('getContactActions', () => {
  const ids = (...args: Parameters<typeof getContactActions>) => getContactActions(...args).map(action => action.label)

  it('offers iPhone users Call, Message, FaceTime, and Copy', () => {
    expect(ids('phone', '555-123-4567', 'ios')).toEqual(['Call', 'Message', 'FaceTime', 'FaceTime Audio', 'Copy Number'])
  })

  it('uses Android vocabulary and skips FaceTime', () => {
    expect(ids('phone', '555-123-4567', 'android')).toEqual(['Call', 'Text', 'Copy Number'])
  })

  it('hands Mac calls to the paired iPhone and skips texting on other desktops', () => {
    expect(ids('phone', '555-123-4567', 'mac')).toEqual(['Call with iPhone', 'Message', 'FaceTime', 'FaceTime Audio', 'Copy Number'])
    expect(ids('phone', '555-123-4567', 'desktop')).toEqual(['Call', 'Copy Number'])
  })

  it('still lets an unparseable number be copied', () => {
    expect(ids('phone', 'ask office', 'ios')).toEqual(['Copy Number'])
  })

  it('offers email and directions', () => {
    expect(ids('email', 'mom@example.com', 'ios')).toEqual(['Send Email', 'Copy Email'])
    expect(ids('address', '1 Main St', 'ios')).toEqual(['Open in Maps', 'Copy Address'])
  })
})
