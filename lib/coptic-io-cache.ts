/**
 * In-process cache in front of Coptic IO, layered over Next's data cache.
 *
 * Next's data cache (fetch `next.revalidate`) is shared across instances and
 * deployments but only stores 200 responses and still costs a lookup, a JSON
 * parse and a zod parse per call. This layer adds, per server instance:
 *
 * - **Memory hits**: parsed values are reused for `freshMs`.
 * - **Coalescing**: concurrent requests for the same key share one load.
 *   (Next only de-duplicates fetches inside a React render, not across route
 *   handler calls, and the calendar route fans out ~45 calls at once.)
 * - **Stale-if-error**: after a value goes stale it is kept for `staleMs`
 *   and served whenever a reload fails, instead of "unavailable".
 * - **Negative caching**: a failed load with nothing stale to fall back on is
 *   remembered for `negativeMs`, so an outage costs one timeout, not one per
 *   request.
 * - **Circuit breaker**: after `failureThreshold` consecutive failures, loads
 *   are skipped for `cooldownMs` (stale values still served), then a single
 *   trial load decides whether to close it again.
 *
 * Kept free of Next and fetch so it is unit-testable with a fake clock.
 */

export type LoadOutcome<T> =
  /** A real answer, including a legitimate "nothing on this day" (`null`). */
  | { ok: true; value: T }
  /** Upstream failed: network, timeout, 5xx, or an unexpected shape. */
  | { ok: false }

export interface CachePolicy {
  /** How long a value is served without reloading. */
  freshMs: number
  /** How long past freshness a value is still served when a reload fails. */
  staleMs: number
  /** How long a failure with no stale fallback is remembered. */
  negativeMs: number
  /** Consecutive failures that open the circuit. */
  failureThreshold: number
  /** How long the circuit stays open before one trial load. */
  cooldownMs: number
  /** Most entries kept; least recently used are evicted first. */
  maxEntries: number
}

interface Entry<T> {
  value: T | null
  freshUntil: number
  staleUntil: number
  /** A remembered failure, not a value. */
  negative: boolean
}

export interface CacheStats {
  hits: number
  staleServed: number
  misses: number
  coalesced: number
  failures: number
  shortCircuited: number
}

export class UpstreamCache {
  private entries = new Map<string, Entry<unknown>>()
  private inflight = new Map<string, Promise<unknown>>()
  private consecutiveFailures = 0
  private circuitOpenUntil = 0
  private trialInFlight = false
  readonly stats: CacheStats = { hits: 0, staleServed: 0, misses: 0, coalesced: 0, failures: 0, shortCircuited: 0 }

  constructor(
    private readonly policy: CachePolicy,
    private readonly now: () => number = Date.now
  ) {}

  /** The cached value for `key`, loading it when needed. Resolves to null when nothing usable is available. */
  async get<T>(key: string, load: () => Promise<LoadOutcome<T>>): Promise<T | null> {
    const time = this.now()
    const entry = this.entries.get(key) as Entry<T> | undefined

    if (entry && time < entry.freshUntil) {
      this.touch(key, entry)
      this.stats.hits++
      return entry.value
    }

    const pending = this.inflight.get(key) as Promise<T | null> | undefined
    if (pending) {
      this.stats.coalesced++
      return pending
    }

    const stale = entry && !entry.negative && time < entry.staleUntil ? entry.value : null

    if (!this.mayLoad(time)) {
      this.stats.shortCircuited++
      if (stale !== null) this.stats.staleServed++
      return stale
    }

    this.stats.misses++
    const promise = this.load(key, load, stale)
    this.inflight.set(key, promise)
    try {
      return await promise
    } finally {
      this.inflight.delete(key)
    }
  }

  /** True while loads are being skipped because upstream keeps failing. */
  isCircuitOpen(): boolean {
    return this.now() < this.circuitOpenUntil
  }

  clear(): void {
    this.entries.clear()
    this.inflight.clear()
    this.consecutiveFailures = 0
    this.circuitOpenUntil = 0
    this.trialInFlight = false
  }

  get size(): number {
    return this.entries.size
  }

  private mayLoad(time: number): boolean {
    if (this.consecutiveFailures < this.policy.failureThreshold) return true
    if (time < this.circuitOpenUntil) return false
    // Cooldown over: let exactly one trial through (half-open).
    if (this.trialInFlight) return false
    this.trialInFlight = true
    return true
  }

  private async load<T>(key: string, load: () => Promise<LoadOutcome<T>>, stale: T | null): Promise<T | null> {
    let outcome: LoadOutcome<T>
    try {
      outcome = await load()
    } catch {
      outcome = { ok: false }
    }
    const time = this.now()
    this.trialInFlight = false

    if (outcome.ok) {
      this.consecutiveFailures = 0
      this.circuitOpenUntil = 0
      this.store(key, {
        value: outcome.value,
        freshUntil: time + this.policy.freshMs,
        staleUntil: time + this.policy.freshMs + this.policy.staleMs,
        negative: false,
      })
      return outcome.value
    }

    this.stats.failures++
    this.consecutiveFailures++
    if (this.consecutiveFailures >= this.policy.failureThreshold) {
      this.circuitOpenUntil = time + this.policy.cooldownMs
    }

    if (stale !== null) {
      // Keep the stale value; don't overwrite it with the failure.
      this.stats.staleServed++
      return stale
    }
    this.store(key, { value: null, freshUntil: time + this.policy.negativeMs, staleUntil: time, negative: true })
    return null
  }

  private store(key: string, entry: Entry<unknown>): void {
    this.entries.delete(key)
    this.entries.set(key, entry)
    while (this.entries.size > this.policy.maxEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
  }

  private touch(key: string, entry: Entry<unknown>): void {
    this.entries.delete(key)
    this.entries.set(key, entry)
  }
}
