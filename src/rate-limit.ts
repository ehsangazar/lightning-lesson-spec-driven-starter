/**
 * Sliding-window rate limiter.
 *
 * This file is the worked example. The contract below is copied verbatim from
 * spec/001-rate-limit/SPEC.md, and every rule it states is pinned by a test in
 * spec/001-rate-limit/acceptance.test.ts.
 *
 * Time is passed in, never read. That is what makes the acceptance tests
 * deterministic instead of sleepy.
 */

export interface RateLimitDecision {
  /** false means the caller must be rejected with 429. */
  allowed: boolean
  /** Requests permitted per window. */
  limit: number
  /** Requests still available to this key right now. Never negative. */
  remaining: number
  /** Epoch ms at which this key regains at least one slot. */
  resetAt: number
  /** Whole seconds to wait, minimum 1 when blocked, 0 when allowed. */
  retryAfter: number
}

export interface RateLimiter {
  check(key: string, now: number): RateLimitDecision
  /** Number of keys currently tracked. Exposed so memory growth is observable. */
  size(): number
}

export interface RateLimiterOptions {
  /** Requests permitted per window. Must be >= 1. */
  limit: number
  /** Window length in milliseconds. Must be >= 1. */
  windowMs: number
}

export function createRateLimiter({ limit, windowMs }: RateLimiterOptions): RateLimiter {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('limit must be an integer >= 1')
  }
  if (!Number.isInteger(windowMs) || windowMs < 1) {
    throw new RangeError('windowMs must be an integer >= 1')
  }

  /** key -> ascending timestamps of the hits still inside the window. */
  const hits = new Map<string, number[]>()
  let lastSweep = Number.NEGATIVE_INFINITY

  /** Drop every key whose hits have all aged out. Amortised to once per window. */
  function sweep(now: number): void {
    const cutoff = now - windowMs
    for (const [key, stamps] of hits) {
      const live = stamps.filter((t) => t > cutoff)
      if (live.length === 0) hits.delete(key)
      else hits.set(key, live)
    }
    lastSweep = now
  }

  return {
    check(key, now) {
      if (now - lastSweep >= windowMs) sweep(now)

      const cutoff = now - windowMs
      const live = (hits.get(key) ?? []).filter((t) => t > cutoff)

      if (live.length >= limit) {
        // Blocked. The oldest live hit is the one whose expiry frees a slot.
        const oldest = live[0] as number
        const resetAt = oldest + windowMs
        hits.set(key, live)
        return {
          allowed: false,
          limit,
          remaining: 0,
          resetAt,
          retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)),
        }
      }

      live.push(now)
      hits.set(key, live)
      const oldest = live[0] as number
      return {
        allowed: true,
        limit,
        remaining: limit - live.length,
        resetAt: oldest + windowMs,
        retryAfter: 0,
      }
    },

    size: () => hits.size,
  }
}
