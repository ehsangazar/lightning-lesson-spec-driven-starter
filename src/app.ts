import { createRateLimiter, type RateLimiter } from './rate-limit.ts'
import { createStore, type Store } from './store.ts'

export interface AppRequest {
  method: string
  path: string
  headers: Record<string, string>
  /** Parsed JSON body, if any. */
  body?: unknown
  /** Remote address, used as the rate-limit key when no client id is sent. */
  ip: string
  /** Epoch ms. Injected so behaviour is testable without waiting. */
  now: number
}

export interface AppResponse {
  status: number
  headers: Record<string, string>
  body: unknown
}

export interface AppOptions {
  store?: Store
  limiter?: RateLimiter
  /** Paths that are never rate limited. */
  exempt?: string[]
}

export const RATE_LIMIT = 10
export const RATE_WINDOW_MS = 60_000

/**
 * The whole API as one pure function: request in, response out.
 * No ports, no sockets, no clock. server.ts is the only thing that owns those.
 */
export function createApp(options: AppOptions = {}): (req: AppRequest) => AppResponse {
  const store = options.store ?? createStore([{ id: '1', name: 'first item' }])
  const limiter =
    options.limiter ?? createRateLimiter({ limit: RATE_LIMIT, windowMs: RATE_WINDOW_MS })
  const exempt = new Set(options.exempt ?? ['/health'])

  return function handle(req) {
    if (!exempt.has(req.path)) {
      const key = req.headers['x-client-id'] ?? req.ip
      const decision = limiter.check(key, req.now)
      const rateHeaders: Record<string, string> = {
        'x-ratelimit-limit': String(decision.limit),
        'x-ratelimit-remaining': String(decision.remaining),
        'x-ratelimit-reset': String(Math.ceil(decision.resetAt / 1000)),
      }

      if (!decision.allowed) {
        return {
          status: 429,
          headers: { ...rateHeaders, 'retry-after': String(decision.retryAfter) },
          body: { error: 'rate_limited' },
        }
      }

      return withHeaders(route(req, store), rateHeaders)
    }

    return route(req, store)
  }
}

function route(req: AppRequest, store: Store): AppResponse {
  if (req.method === 'GET' && req.path === '/health') {
    return json(200, { status: 'ok' })
  }

  if (req.method === 'GET' && req.path === '/items') {
    return json(200, { items: store.list() })
  }

  if (req.method === 'POST' && req.path === '/items') {
    const name = (req.body as { name?: unknown } | undefined)?.name
    if (typeof name !== 'string' || name.trim() === '') {
      return json(400, { error: 'invalid_name' })
    }
    return json(201, { item: store.create(name.trim()) })
  }

  return json(404, { error: 'not_found' })
}

function json(status: number, body: unknown): AppResponse {
  return { status, headers: { 'content-type': 'application/json' }, body }
}

function withHeaders(res: AppResponse, headers: Record<string, string>): AppResponse {
  return { ...res, headers: { ...res.headers, ...headers } }
}
