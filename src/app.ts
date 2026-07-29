// The whole API as one pure function: request in, response out. No ports, no
// sockets, no clock, so tests drive it directly without networking. server.ts
// owns those and is the only file that does.
//
// `ip` and `now` on AppRequest are unused here. They are carried so that a
// per-client, time-windowed policy can be added without reshaping the request
// type and rewriting every caller.

import { createStore, type Store } from './store.ts'

export interface AppRequest {
  method: string
  path: string
  headers: Record<string, string>
  body?: unknown
  ip: string
  now: number
}

export interface AppResponse {
  status: number
  headers: Record<string, string>
  body: unknown
}

export interface AppOptions {
  store?: Store
}

export function createApp(options: AppOptions = {}): (req: AppRequest) => AppResponse {
  // Empty by default: FR-006 says a service that has recorded nothing returns
  // an empty collection, so seeding a demo item here would fail its own spec.
  const store = options.store ?? createStore()

  return function handle(req) {
    return route(req, store)
  }
}

function route(req: AppRequest, store: Store): AppResponse {
  if (req.method === 'GET' && req.path === '/health') {
    return json(200, { ok: true })
  }

  // Bare list, no envelope. An envelope earns its keep by carrying paging
  // metadata, and pagination is out of scope for this spec.
  if (req.method === 'GET' && req.path === '/items') {
    return json(200, store.list())
  }

  if (req.method === 'POST' && req.path === '/items') {
    const name = readName(req.body)
    if (name === undefined || name.trim() === '') {
      return json(400, { error: 'bad_request' })
    }
    return json(201, store.create(name.trim()))
  }

  return json(404, { error: 'not_found' })
}

/**
 * A cast would have silenced the compiler here rather than checking anything.
 * Narrowing states the check the route has to make regardless, so an unreadable
 * body and a body with no usable name arrive at the same place by the same path.
 */
function readName(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('name' in body)) return undefined
  return typeof body.name === 'string' ? body.name : undefined
}

function json(status: number, body: unknown): AppResponse {
  return { status, headers: { 'content-type': 'application/json' }, body }
}
