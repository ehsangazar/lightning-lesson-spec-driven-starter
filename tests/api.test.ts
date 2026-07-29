import { describe, expect, it } from 'vitest'
import { createApp, type AppRequest } from '../src/app.ts'
import { createStore } from '../src/store.ts'

/**
 * REGRESSION SUITE.
 *
 * This is what already worked before anyone asked for a new feature. It exists
 * to catch the second failure mode of coding agents: not "it did not build the
 * thing" but "it built the thing and quietly broke something else".
 *
 * Nothing here mentions the feature under construction. That is the point.
 */

function request(overrides: Partial<AppRequest> = {}): AppRequest {
  return {
    method: 'GET',
    path: '/health',
    headers: {},
    ip: '10.0.0.1',
    now: 0,
    ...overrides,
  }
}

describe('API contract', () => {
  it('reports health', () => {
    const res = createApp()(request({ path: '/health' }))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('starts with nothing recorded', () => {
    const res = createApp()(request({ path: '/items' }))
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('lists items', () => {
    const app = createApp({ store: createStore([{ id: '1', name: 'first item' }]) })
    const res = app(request({ path: '/items' }))
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ id: '1', name: 'first item' }])
  })

  it('creates an item and returns it', () => {
    const app = createApp({ store: createStore() })
    const created = app(request({ method: 'POST', path: '/items', body: { name: 'widget' } }))
    expect(created.status).toBe(201)
    expect(created.body).toEqual({ id: '1', name: 'widget' })

    const listed = app(request({ path: '/items' }))
    expect(listed.body).toEqual([{ id: '1', name: 'widget' }])
  })

  it('trims the name before storing it', () => {
    const app = createApp({ store: createStore() })
    const res = app(request({ method: 'POST', path: '/items', body: { name: '  spaced  ' } }))
    expect(res.body).toEqual({ id: '1', name: 'spaced' })
  })

  it.each([
    ['missing body', undefined],
    ['missing name', {}],
    ['empty name', { name: '   ' }],
    ['wrong type', { name: 42 }],
  ])('rejects an invalid create: %s', (_label, body) => {
    const app = createApp({ store: createStore() })
    const res = app(request({ method: 'POST', path: '/items', body }))
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'bad_request' })
  })

  it('404s an unknown path', () => {
    const res = createApp()(request({ path: '/nope' }))
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'not_found' })
  })

  it('answers JSON', () => {
    const res = createApp()(request({ path: '/items' }))
    expect(res.headers['content-type']).toBe('application/json')
  })
})
