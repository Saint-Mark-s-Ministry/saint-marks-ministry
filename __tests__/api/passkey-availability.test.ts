// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

vi.mock('@/lib/passkey-api', () => ({
  passkeyJson: (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } }),
}))
import { GET } from '@/app/api/public/passkeys/route'

beforeEach(() => {
  vi.stubEnv('PASSKEY_RP_ID', 'stmarkministry.app')
  vi.stubEnv('PASSKEY_ORIGIN', 'https://www.stmarkministry.app')
})
afterEach(() => vi.unstubAllEnvs())

describe('public passkey configuration status', () => {
  it('enables the production hostname with the documented configuration', async () => {
    const res = GET()
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ enabled: true })
  })
  it('accepts copied values with whitespace and a root trailing slash', async () => {
    vi.stubEnv('PASSKEY_RP_ID', ' stmarkministry.app\n')
    vi.stubEnv('PASSKEY_ORIGIN', ' https://www.stmarkministry.app/\n')
    expect(await GET().json()).toEqual({ enabled: true })
  })
  it('reports exactly which environment settings are missing', async () => {
    vi.stubEnv('PASSKEY_RP_ID', ' ')
    expect(await GET().json()).toEqual({ enabled: false, reason: 'missing_environment', missing: ['PASSKEY_RP_ID'] })
    vi.stubEnv('PASSKEY_ORIGIN', '')
    expect(await GET().json()).toEqual({ enabled: false, reason: 'missing_environment', missing: ['PASSKEY_RP_ID', 'PASSKEY_ORIGIN'] })
  })
  it.each([
    ['https://www.stmarkministry.app/path', 'invalid_origin'],
    ['https://user:private-value@www.stmarkministry.app', 'invalid_origin'],
    ['invalid-origin-private-value', 'invalid_origin'],
    ['http://www.stmarkministry.app', 'https_required'],
    ['https://unrelated-private-value.test', 'rp_id_mismatch'],
  ])('reports a safe reason for %s', async (origin, reason) => {
    vi.stubEnv('PASSKEY_ORIGIN', origin)
    const body = await GET().json()
    expect(body).toEqual({ enabled: false, reason })
    expect(JSON.stringify(body)).not.toContain('private-value')
  })
  it('reports a hostname-only RP ID requirement', async () => {
    vi.stubEnv('PASSKEY_RP_ID', 'https://stmarkministry.app')
    expect(await GET().json()).toEqual({ enabled: false, reason: 'invalid_rp_id' })
  })
})
