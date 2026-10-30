// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET as capability } from '@/app/api/public/passkeys/route'
import { GET as association } from '@/app/.well-known/apple-app-site-association/route'

const appId = 'ABCDE12345.org.example.app'

beforeEach(() => {
  vi.stubEnv('PASSKEY_RP_ID', 'app.example.test')
  vi.stubEnv('PASSKEY_ORIGIN', 'https://app.example.test')
  vi.stubEnv('PASSKEY_IOS_APP_IDS', '')
})
afterEach(() => vi.unstubAllEnvs())

describe('public passkey capability', () => {
  it('reports disabled, and nothing else, when passkeys are not configured', async () => {
    vi.stubEnv('PASSKEY_RP_ID', '')
    const res = capability()
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ enabled: false })
  })
  it('reports web passkeys without iOS until an App ID is configured', async () => {
    expect(await capability().json()).toEqual({ enabled: true, rpId: 'app.example.test', ios: false })
  })
  it('reports iOS support once an App ID is configured', async () => {
    vi.stubEnv('PASSKEY_IOS_APP_IDS', appId)
    expect(await capability().json()).toEqual({ enabled: true, rpId: 'app.example.test', ios: true })
  })
  it('never lets a malformed iOS list disable web passkeys', async () => {
    vi.stubEnv('PASSKEY_IOS_APP_IDS', 'nonsense')
    expect(await capability().json()).toEqual({ enabled: true, rpId: 'app.example.test', ios: false })
  })
})

describe('apple-app-site-association', () => {
  it('serves the webcredentials App IDs as JSON', async () => {
    vi.stubEnv('PASSKEY_IOS_APP_IDS', appId)
    const res = association()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual({ webcredentials: { apps: [appId] } })
  })
  it.each([
    ['no iOS App ID', { PASSKEY_IOS_APP_IDS: '' }],
    ['passkeys unconfigured', { PASSKEY_ORIGIN: '', PASSKEY_IOS_APP_IDS: appId }],
    ['a malformed App ID', { PASSKEY_IOS_APP_IDS: 'nonsense' }],
  ])('is a plain 404 with %s', (_name, env) => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
    const res = association()
    expect(res.status).toBe(404)
  })
})
