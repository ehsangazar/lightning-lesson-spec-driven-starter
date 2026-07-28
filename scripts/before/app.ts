// The "before" snapshot of src/app.ts: the API as it stood before anyone asked
// for rate limiting. `npm run demo:reset` copies this over src/app.ts and
// deletes src/rate-limit.ts, putting the repo back to the state both demo runs
// start from. Not part of the build; tsconfig only includes src, tests, spec.

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
  const store = options.store ?? createStore([{ id: '1', name: 'first item' }])

  return function handle(req) {
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
