import { afterEach, describe, expect, it, vi } from 'vitest'
import { appUrl, DEFAULT_FROM, isAllowlisted, isLiveDelivery, sendEmail } from '@/lib/mail/send'
import { passwordReset, registrationReceived } from '@/lib/mail/templates'

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv

const message = { to: 'person@example.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi', tag: 'test' }

afterEach(() => vi.unstubAllGlobals())

describe('delivery guard', () => {
  it('is live only in production or when forced', () => {
    expect(isLiveDelivery(env({ VERCEL_ENV: 'production' }))).toBe(true)
    expect(isLiveDelivery(env({ VERCEL_ENV: 'preview' }))).toBe(false)
    expect(isLiveDelivery(env({}))).toBe(false)
    expect(isLiveDelivery(env({ EMAIL_DELIVERY: 'live' }))).toBe(true)
    expect(isLiveDelivery(env({ VERCEL_ENV: 'production', EMAIL_DELIVERY: 'sandbox' }))).toBe(false)
  })

  it('allows resend.dev and listed addresses or domains', () => {
    const allow = env({ EMAIL_DEV_ALLOWLIST: 'me@example.com, @team.test' })
    expect(isAllowlisted('delivered@resend.dev', allow)).toBe(true)
    expect(isAllowlisted(' ME@example.com ', allow)).toBe(true)
    expect(isAllowlisted('a@team.test', allow)).toBe(true)
    expect(isAllowlisted('other@example.com', allow)).toBe(false)
  })

  it('skips real recipients outside production without calling Resend', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const result = await sendEmail(message, env({ RESEND_API_KEY: 'k' }))
    expect(result).toEqual({ status: 'skipped', reason: 'not-allowlisted' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('skips when no API key is configured', async () => {
    expect(await sendEmail(message, env({ VERCEL_ENV: 'production' }))).toEqual({ status: 'skipped', reason: 'no-api-key' })
  })

  it('posts to Resend in production', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'em_1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const result = await sendEmail(message, env({ RESEND_API_KEY: 'k', VERCEL_ENV: 'production' }))
    expect(result).toEqual({ status: 'sent', id: 'em_1' })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.headers.Authorization).toBe('Bearer k')
    expect(JSON.parse(init.body)).toMatchObject({ from: DEFAULT_FROM, to: ['person@example.com'], tags: [{ name: 'type', value: 'test' }] })
  })

  it('reports Resend errors and network failures instead of throwing', async () => {
    const live = env({ RESEND_API_KEY: 'k', VERCEL_ENV: 'production' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: 'validation_error', message: 'bad from' }), { status: 422 })))
    expect(await sendEmail(message, live)).toEqual({ status: 'failed', error: '422 validation_error bad from' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await sendEmail(message, live)).toEqual({ status: 'failed', error: 'offline' })
  })

  it('builds links from APP_URL, then NEXTAUTH_URL', () => {
    expect(appUrl(env({ APP_URL: 'https://stmarkministry.app/', NEXTAUTH_URL: 'x' }))).toBe('https://stmarkministry.app')
    expect(appUrl(env({ NEXTAUTH_URL: 'https://a.test' }))).toBe('https://a.test')
  })
})

describe('templates', () => {
  it('escapes user-supplied names in HTML', () => {
    const { html, text } = registrationReceived({ name: '<script>x</script> Doe' })
    expect(html).not.toContain('<script>x')
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(text).toContain('Hi <script>x</script>,')
  })

  it('puts the reset link in both parts', () => {
    const url = 'https://stmarkministry.app/reset-password?token=abc'
    const email = passwordReset({ name: 'Mina', resetUrl: url, expiresInMinutes: 60 })
    expect(email.html).toContain(`href="${url}"`)
    expect(email.text).toContain(url)
    expect(email.text).toContain('60 minutes')
  })
})
