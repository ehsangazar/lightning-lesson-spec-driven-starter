import { describe, expect, it } from 'vitest'
import { createApp, type AppRequest } from '../../src/app.ts'
import { createRateLimiter } from '../../src/rate-limit.ts'
import { createStore } from '../../src/store.ts'

/**
 * ACCEPTANCE SUITE for SPEC 001.
 *
 * This file is the executable half of SPEC.md. Each `it` is labelled with the
 * criterion it pins (A1 … A9). If the prose and this file ever disagree, this
 * file wins, because this is the half the agent cannot talk its way past.
 *
 * Everything is driven by an injected clock. No timers, no sleeping, no flake.
 */

const LIMIT = 10
const WINDOW = 60_000

function makeApp() {
  return createApp({
    store: createStore(),
    limiter: createRateLimiter({ limit: LIMIT, windowMs: WINDOW }),
  })
}

function get(
  app: ReturnType<typeof createApp>,
  now: number,
  overrides: Partial<AppRequest> = {},
) {
  const req: AppRequest = {
    method: 'GET',
    path: '/items',
    headers: {},
    ip: '10.0.0.1',
    now,
    ...overrides,
  }
  return app(req)
}

describe('A1 · the window', () => {
  it('allows the first 10 requests and rejects the 11th', () => {
    const app = makeApp()
    for (let i = 0; i < LIMIT; i++) {
      expect(get(app, i).status, `request ${i + 1} should be allowed`).toBe(200)
    }
    expect(get(app, LIMIT).status).toBe(429)
  })
})

describe('A2 · shape of a rejection', () => {
  it('returns 429 with a rate_limited body and a Retry-After of at least 1 second', () => {
    const app = makeApp()
    for (let i = 0; i < LIMIT; i++) get(app, 0)

    const res = get(app, 0)
    expect(res.status).toBe(429)
    expect(res.body).toEqual({ error: 'rate_limited' })
    expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1)
    expect(Number.isInteger(Number(res.headers['retry-after']))).toBe(true)
  })
})

describe('A3 · sliding, not fixed', () => {
  // The criterion that separates a real implementation from the plausible one.
  // A fixed 60s calendar bucket passes A1 and A2 and fails here: at t=60_001 it
  // hands back all ten slots at once instead of the single one that has expired.
  it('frees exactly one slot as the oldest hit ages out', () => {
    const app = makeApp()
    for (let i = 0; i < LIMIT; i++) {
      expect(get(app, i * 1_000).status).toBe(200) // hits at 0s, 1s … 9s
    }

    // 1ms before the first hit turns 60s old: still fully blocked.
    expect(get(app, 59_999).status).toBe(429)

    // 1ms after: the t=0 hit has expired and exactly one slot is available.
    const freed = get(app, 60_001)
    expect(freed.status).toBe(200)
    expect(freed.headers['x-ratelimit-remaining']).toBe('0')

    // …and only one. A fixed window would allow nine more here.
    expect(get(app, 60_001).status).toBe(429)
  })
})

describe('A4 · key derivation', () => {
  it('limits two client ids independently', () => {
    const app = makeApp()
    for (let i = 0; i < LIMIT; i++) get(app, 0, { headers: { 'x-client-id': 'alpha' } })

    expect(get(app, 0, { headers: { 'x-client-id': 'alpha' } }).status).toBe(429)
    expect(get(app, 0, { headers: { 'x-client-id': 'beta' } }).status).toBe(200)
  })

  it('falls back to the remote IP when no client id is sent', () => {
    const app = makeApp()
    for (let i = 0; i < LIMIT; i++) get(app, 0, { ip: '10.0.0.1' })

    expect(get(app, 0, { ip: '10.0.0.1' }).status).toBe(429)
    expect(get(app, 0, { ip: '10.0.0.2' }).status).toBe(200)
    expect(get(app, 0, { ip: '10.0.0.1', headers: { 'x-client-id': 'gamma' } }).status).toBe(200)
  })
})

describe('A5 · remaining count', () => {
  it('counts down from 9 and pins to 0 once blocked', () => {
    const app = makeApp()
    const seen: string[] = []
    for (let i = 0; i < LIMIT; i++) {
      seen.push(String(get(app, 0).headers['x-ratelimit-remaining']))
    }
    expect(seen).toEqual(['9', '8', '7', '6', '5', '4', '3', '2', '1', '0'])
    expect(get(app, 0).headers['x-ratelimit-remaining']).toBe('0')
  })

  it('advertises the limit on every non-exempt response', () => {
    const app = makeApp()
    expect(get(app, 0).headers['x-ratelimit-limit']).toBe('10')
  })
})

describe('A6 · reset units', () => {
  it('reports X-RateLimit-Reset in unix seconds, not milliseconds', () => {
    const app = makeApp()
    const startedAt = 1_700_000_000_000
    const res = get(app, startedAt)

    expect(res.headers['x-ratelimit-reset']).toBe(String((startedAt + WINDOW) / 1000))
  })
})

describe('A7 · rejections are free', () => {
  it('does not consume a slot when the caller is already blocked', () => {
    const app = makeApp()
    for (let i = 0; i < LIMIT; i++) get(app, 0)
    for (let i = 0; i < 5; i++) expect(get(app, 30_000).status).toBe(429)

    // If the rejections at t=30s had been recorded, the caller would still be
    // blocked here and would never recover under sustained load.
    const after = get(app, 60_001)
    expect(after.status).toBe(200)
    expect(after.headers['x-ratelimit-remaining']).toBe('9')
  })
})

describe('A8 · exempt paths', () => {
  it('never limits /health and never decorates it with rate-limit headers', () => {
    const app = makeApp()
    for (let i = 0; i < 50; i++) {
      const res = get(app, 0, { path: '/health' })
      expect(res.status).toBe(200)
      expect(res.headers['x-ratelimit-limit']).toBeUndefined()
    }
    // Health checks must not spend the budget of real traffic either.
    expect(get(app, 0, { path: '/items' }).status).toBe(200)
  })
})

describe('A9 · bounded memory', () => {
  it('drops keys once their hits have all expired', () => {
    const limiter = createRateLimiter({ limit: LIMIT, windowMs: WINDOW })
    for (let i = 0; i < 100; i++) limiter.check(`key-${i}`, 0)
    expect(limiter.size()).toBe(100)

    limiter.check('late-arrival', WINDOW + 1)
    expect(limiter.size()).toBe(1)
  })

  it('rejects nonsense options rather than limiting nothing', () => {
    expect(() => createRateLimiter({ limit: 0, windowMs: WINDOW })).toThrow(RangeError)
    expect(() => createRateLimiter({ limit: LIMIT, windowMs: 0 })).toThrow(RangeError)
  })
})
