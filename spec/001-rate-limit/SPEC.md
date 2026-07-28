# SPEC 001 · Rate limiting

> This is the worked example. It is what "add rate limiting to the API" looks
> like once it has been made precise enough that an agent has to get it right.
> Read it beside `acceptance.test.ts`: every rule below is pinned by a test.

**Status:** implemented
**Owner:** @ehsangazar

---

## 1. Intent

One paragraph. What changes for the user, and why now.

A single client can currently issue unlimited requests and starve everyone else.
Add per-client rate limiting to the public API so that one noisy caller degrades
only itself. This is a protection change, not a product change: no endpoint
changes shape, and no existing caller under normal load sees any difference.

**Not doing** (scope fence, as important as the intent):

- No distributed or cross-process limiting. In-memory, single process.
- No per-endpoint or per-plan limits. One global limit for everyone.
- No configuration surface, no env vars, no admin override.
- No persistence. Restarting the process resets all counters.

---

## 2. Interface

The contract, stated as types before a line of implementation exists. An agent
that invents a different shape has failed the spec even if its tests pass.

```ts
// src/rate-limit.ts

export interface RateLimitDecision {
  allowed: boolean      // false means reject the caller with 429
  limit: number         // requests permitted per window
  remaining: number     // slots left for this key right now, never negative
  resetAt: number       // epoch ms at which this key regains at least one slot
  retryAfter: number    // whole seconds to wait; minimum 1 when blocked, 0 when allowed
}

export interface RateLimiter {
  check(key: string, now: number): RateLimitDecision
  size(): number        // keys currently tracked, so memory growth is observable
}

export interface RateLimiterOptions {
  limit: number         // integer >= 1
  windowMs: number      // integer >= 1
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter
```

Wiring in `src/app.ts`:

```ts
export const RATE_LIMIT = 10
export const RATE_WINDOW_MS = 60_000

export interface AppOptions {
  store?: Store
  limiter?: RateLimiter   // injected in tests
  exempt?: string[]       // paths never rate limited; defaults to ['/health']
}
```

### Design constraints on the interface

- `check` **takes the current time as an argument**. It must never call
  `Date.now()` itself. This is what makes the acceptance tests deterministic
  rather than dependent on sleeping.
- `check` is the only mutating call. There is no separate `consume` or `reset`.
- The limiter knows nothing about HTTP. It takes a string key, not a request.

---

## 3. Behaviour

1. **Window.** 10 requests per 60 seconds, per key.
2. **Sliding, not fixed.** The window is the trailing 60 seconds from `now`, not
   a calendar bucket. A hit stops counting exactly 60 000 ms after it happened,
   and each one expires independently.
3. **Key.** The `X-Client-Id` header when present, otherwise the remote IP.
   Distinct keys never affect each other.
4. **Rejection.** Over the limit responds `429` with body
   `{ "error": "rate_limited" }` and a `Retry-After` header in whole seconds,
   never below 1.
5. **Headers on every non-exempt response**, allowed or rejected:
   `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
   (unix **seconds**, not ms).
6. **Rejected requests do not consume a slot.** Being blocked must not extend
   the block.
7. **Exempt paths.** `/health` is never rate limited and carries no rate-limit
   headers. Load balancers must not be able to lock themselves out.
8. **Bounded memory.** Keys whose hits have all expired are dropped. Tracked key
   count must fall back to reality once traffic passes, not grow forever.

---

## 4. Acceptance criteria

Executable, in `spec/001-rate-limit/acceptance.test.ts`. Prose here, assertions
there; if the two ever disagree, the test file wins.

| # | Criterion | Why it is here |
| - | --------- | -------------- |
| A1 | The first 10 requests in a window are allowed; the 11th is rejected | The headline behaviour |
| A2 | A rejection is `429` + `{ error: "rate_limited" }` + `Retry-After >= 1` | Shape of the failure, not just the status |
| A3 | At `t = 59_999 ms` the caller is still blocked; at `t = 60_001 ms` exactly one slot has freed | **Kills the fixed-window implementation.** A calendar bucket passes A1 and A2 and fails this |
| A4 | Two client ids, and an id versus a bare IP, are limited independently | Key derivation is right, not just present |
| A5 | `X-RateLimit-Remaining` counts 9, 8, 7 … and pins to 0 when blocked | Off-by-one in the visible contract |
| A6 | `X-RateLimit-Reset` is unix **seconds** | The units bug that ships and is discovered by a client |
| A7 | Rejected requests do not consume a slot | Prevents a permanent lockout under sustained load |
| A8 | `/health` is never limited, over any volume | Availability trap |
| A9 | Tracked key count drops once a window has fully passed | Bounded memory, made observable via `size()` |
| A10 | The regression suite in `tests/` still passes untouched | "It works and it broke something else" |

---

## 5. Allowed paths

The gate reads these fences. A diff that touches anything outside the `allow`
list fails `npm run gate` before a human reads a line of it.

```allow
src/rate-limit.ts
src/app.ts
spec/001-rate-limit/**
```

Everything else in the repo is out of bounds for this change, on top of the
repo-wide rules in [`constraints.md`](../../constraints.md).

Note what is **not** in the list: `tests/**`. The agent may not edit the
regression suite to make its change pass. That single omission removes the most
common way an agent turns a red build green.

---

## 6. Review checklist

What a human confirms after the gate is green. The gate proves the code does
what the spec says; this asks whether the spec was right.

- [ ] Is the window genuinely sliding? Read the data structure, not the tests.
- [ ] Is the memory bound real, or does one key per visitor accumulate forever?
- [ ] Does `retryAfter` round in the safe direction (up, never to 0)?
- [ ] Does anything outside `src/rate-limit.ts` now read the clock directly?
- [ ] Would a reader of `app.ts` see rate limiting applied before routing?
