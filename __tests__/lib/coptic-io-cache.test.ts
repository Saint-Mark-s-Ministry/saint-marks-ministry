import { describe, expect, it, vi } from 'vitest'
import { UpstreamCache, type CachePolicy, type LoadOutcome } from '@/lib/coptic-io-cache'

const policy: CachePolicy = {
  freshMs: 1000,
  staleMs: 10_000,
  negativeMs: 100,
  failureThreshold: 3,
  cooldownMs: 500,
  maxEntries: 3,
}

function setup(overrides: Partial<CachePolicy> = {}) {
  let time = 0
  const cache = new UpstreamCache({ ...policy, ...overrides }, () => time)
  return { cache, advance: (ms: number) => (time += ms) }
}

const ok = <T,>(value: T) => async (): Promise<LoadOutcome<T>> => ({ ok: true, value })
const fail = async (): Promise<LoadOutcome<string>> => ({ ok: false })

describe('UpstreamCache', () => {
  it('serves fresh values from memory and reloads once they go stale', async () => {
    const { cache, advance } = setup()
    const load = vi.fn(ok('a'))
    expect(await cache.get('k', load)).toBe('a')
    expect(await cache.get('k', load)).toBe('a')
    expect(load).toHaveBeenCalledTimes(1)

    advance(1001)
    await cache.get('k', load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('caches a legitimate empty answer like any other', async () => {
    const { cache } = setup()
    const load = vi.fn(ok(null))
    expect(await cache.get('k', load)).toBeNull()
    expect(await cache.get('k', load)).toBeNull()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('coalesces concurrent loads of the same key', async () => {
    const { cache } = setup()
    let resolve!: (value: LoadOutcome<string>) => void
    const load = vi.fn(() => new Promise<LoadOutcome<string>>((r) => (resolve = r)))
    const results = Promise.all([cache.get('k', load), cache.get('k', load), cache.get('k', load)])
    resolve({ ok: true, value: 'a' })
    expect(await results).toEqual(['a', 'a', 'a'])
    expect(load).toHaveBeenCalledTimes(1)
    expect(cache.stats.coalesced).toBe(2)
  })

  it('serves the stale value when a reload fails, and keeps it', async () => {
    const { cache, advance } = setup()
    await cache.get('k', ok('good'))
    advance(1001)
    expect(await cache.get('k', fail)).toBe('good')
    expect(await cache.get('k', vi.fn(async () => { throw new Error('network') }))).toBe('good')
    expect(cache.stats.staleServed).toBe(2)

    // Past the stale window there is nothing left to fall back on.
    advance(10_000)
    expect(await cache.get('k', fail)).toBeNull()
  })

  it('remembers a failure briefly so an outage costs one call, not one per request', async () => {
    const { cache, advance } = setup()
    const load = vi.fn(fail)
    expect(await cache.get('k', load)).toBeNull()
    expect(await cache.get('k', load)).toBeNull()
    expect(load).toHaveBeenCalledTimes(1)

    advance(101)
    await cache.get('k', load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('opens the circuit after repeated failures, then lets one trial through', async () => {
    const { cache, advance } = setup()
    for (const key of ['a', 'b', 'c']) await cache.get(key, fail)
    expect(cache.isCircuitOpen()).toBe(true)

    const skipped = vi.fn(ok('x'))
    expect(await cache.get('d', skipped)).toBeNull()
    expect(skipped).not.toHaveBeenCalled()

    advance(501)
    expect(cache.isCircuitOpen()).toBe(false)
    let resolve!: (value: LoadOutcome<string>) => void
    const trial = vi.fn(() => new Promise<LoadOutcome<string>>((r) => (resolve = r)))
    const first = cache.get('e', trial)
    // Only one trial while half-open.
    expect(await cache.get('f', vi.fn(ok('y')))).toBeNull()
    resolve({ ok: true, value: 'recovered' })
    expect(await first).toBe('recovered')

    // A success closes it again.
    expect(await cache.get('g', ok('z'))).toBe('z')
    expect(cache.stats.shortCircuited).toBe(2)
  })

  it('keeps a separate circuit per endpoint', async () => {
    const { cache } = setup({ maxEntries: 10 })
    for (const key of ['a', 'b', 'c']) await cache.get(key, fail, '/api/celebrations')
    expect(cache.isCircuitOpen('/api/celebrations')).toBe(true)
    expect(cache.isCircuitOpen('/api/fasting')).toBe(false)
    expect(await cache.get('d', ok('fine'), '/api/fasting')).toBe('fine')
    expect(await cache.get('e', ok('skipped'), '/api/celebrations')).toBeNull()
  })

  it('serves stale values while the circuit is open', async () => {
    const { cache, advance } = setup({ maxEntries: 10 })
    await cache.get('k', ok('good'))
    advance(1001)
    for (const key of ['a', 'b', 'c']) await cache.get(key, fail)
    const load = vi.fn(ok('new'))
    expect(await cache.get('k', load)).toBe('good')
    expect(load).not.toHaveBeenCalled()
  })

  it('evicts the least recently used entry beyond maxEntries', async () => {
    const { cache } = setup()
    for (const key of ['a', 'b', 'c']) await cache.get(key, ok(key))
    await cache.get('a', ok('a')) // touch a
    await cache.get('d', ok('d')) // evicts b
    expect(cache.size).toBe(3)
    const reload = vi.fn(ok('b2'))
    expect(await cache.get('b', reload)).toBe('b2')
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
