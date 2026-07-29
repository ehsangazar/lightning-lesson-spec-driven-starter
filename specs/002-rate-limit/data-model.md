# Phase 1 Data Model: Per-Client Rate Limiting

**Feature**: [spec.md](./spec.md) | **Date**: 2026-07-29

Nothing persists. All state is a single `Map` living for the life of the process.

## Key

| Property | Value |
|---|---|
| Type | `string` |
| Derived from | `X-Client-Id` header when present and non-empty, otherwise the remote address |
| Derived where | `src/app.ts`, never in the limiter (FR-017) |
| Fallback | A single shared literal when no address can be determined |

Keys are opaque to the limiter. It never learns whether a key came from a header or an address,
which is the property that lets it be tested with `check('a', 0)`.

## Hit

One recorded request, stored as a bare `number`: milliseconds since the epoch.

| Rule | Value |
|---|---|
| Counts while | `now - hitTime < 60000` (research [R3](./research.md)) |
| Ordering | Ascending, because `now` only moves forward |
| Recorded when | The request is **allowed** only |
| Not recorded when | The request is refused (FR-008), or the route is exempt (FR-012) |

Storing a bare number rather than an object is deliberate: a hit has no identity, no other
attribute, and nothing ever looks one up.

## Decision

The limiter's return value. Everything `app.ts` needs to answer a request.

| Field | Type | Meaning |
|---|---|---|
| `allowed` | `boolean` | Whether the request may proceed |
| `limit` | `number` | The ceiling, always 10 |
| `remaining` | `number` | Allowance left after this request. Never negative, pinned at 0 when refused (FR-011) |
| `resetAt` | `number` | Epoch **milliseconds** when the oldest counted hit expires |
| `retryAfter` | `number` | Whole seconds, never below 1 (FR-007) |

**Unit boundary**, and it is the one that bites: `resetAt` is milliseconds inside the limiter, and
is converted to **seconds** by `app.ts` when writing `X-RateLimit-Reset` (FR-010). The limiter
speaks the project's `now: number` convention throughout; the header speaks the HTTP convention.
One conversion, in one place, in the file that already owns transport concerns.

## Limiter state

| Structure | `Map<string, number[]>` |
|---|---|
| Bound | Keys with no live hits are dropped (FR-014), so size tracks active callers, not total ever seen |
| Observable | `size(now)` sweeps expired keys and returns the live count (FR-015) |
| Lifetime | The process. A restart grants everyone a fresh allowance |

## Public interface

```ts
// src/rate-limit.ts

export interface RateLimitDecision {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfter: number
}

export interface RateLimiter {
  check(key: string, now: number): RateLimitDecision
  size(now: number): number
}

export interface RateLimiterOptions {
  limit: number
  windowMs: number
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter
```

Both methods take `now`. Neither reads a clock. That is FR-016 and Constitution II expressed as a
type signature rather than as a comment, which is why it is hard to violate by accident.

## Changes to feature 001's types

`AppOptions` in `src/app.ts` gains two optional fields:

| Field | Type | Purpose |
|---|---|---|
| `limiter` | `RateLimiter` | Injected so tests drive the window without constructing one |
| `exempt` | `string[]` | Paths that skip limiting. Defaults to `['/health']` |

`AppRequest` needs no change. It already carries `ip` and `now`, added during feature 001 in
anticipation of this feature, which is why that decision was recorded there rather than left as an
unexplained pair of unused fields.
