# Contract: Per-Client Rate Limiting

**Feature**: [spec.md](../spec.md) | **Date**: 2026-07-29

Two contracts: the HTTP surface, and the module interface the spec constrains directly.

---

## HTTP surface

### Headers on every non-exempt response

Present whether the request was allowed or refused (FR-009).

| Header | Value |
|---|---|
| `X-RateLimit-Limit` | `10`, always |
| `X-RateLimit-Remaining` | Allowance left after this request. Counts `9, 8, 7 …`, pinned at `0` when refused (FR-011) |
| `X-RateLimit-Reset` | Unix **seconds**, rounded up, when the oldest counted hit expires (FR-010) |

`X-RateLimit-Reset` is seconds in every response without exception. The spec says so twice
because a mixed-unit reset is the failure a client cannot detect from one response.

### Refusal

**Response** `429`

```json
{ "error": "rate_limited" }
```

Plus `Retry-After`, whole seconds, never below `1` (FR-007), alongside the three headers above.

A refused request is **not** recorded (FR-008). A caller that retries every 100 ms while blocked
recovers at exactly the same instant as one that waits quietly. This is the rule that stops a
block from feeding itself.

### The health exemption

`GET /health` is never refused at any volume (FR-012) and carries **no** rate-limit headers at
all (FR-013). Not zeroed headers, not a limit of infinity: absent.

### Everything else

Unchanged from [feature 001](../../001-items-api/contracts/http-api.md). Rate limiting runs before
routing, so a `404` or a `400` still consumes a slot, and still carries the three headers.

---

## Module interface

```ts
export function createRateLimiter(options: RateLimiterOptions): RateLimiter
```

### `check(key: string, now: number): RateLimitDecision`

Asks whether `key` may proceed at `now`, and records the hit when the answer is yes.

| Given | Returns |
|---|---|
| A key with fewer than 10 live hits | `allowed: true`, hit recorded, `remaining` one lower |
| A key at 10 live hits | `allowed: false`, **nothing recorded**, `remaining: 0` |
| A key never seen | `allowed: true`, `remaining: 9` |

`resetAt` is the moment the oldest live hit expires, in epoch milliseconds. `retryAfter` is that
gap in whole seconds, floored at 1.

### `size(now: number): number`

Sweeps keys whose hits have all expired, then returns how many remain (FR-014, FR-015). Takes
`now` because deciding what has expired needs the time, and this project never reads a clock below
the server layer.

### What the limiter must never do

Stated as prohibitions because each one is a coupling that would make the sliding window
untestable:

- **Never call `Date.now()`** or any clock (FR-016). Time arrives as an argument, always.
- **Never see a request, header, path, or method** (FR-017). It takes a string.
- **Never read configuration or the environment.** Limit and window come from its options.

### Errors

Programmer errors throw, per Constitution IV:

| Condition | Throws |
|---|---|
| `limit` or `windowMs` not a positive finite number | `RangeError` |
| `key` not a string | `TypeError` |
| `now` not a finite number | `TypeError` |

These are not caller errors. A client sending too many requests gets a `429`; a developer passing
`undefined` as the time gets a stack trace.

---

## The boundary

The one line the whole feature turns on:

```text
a hit counts while  now - hitTime < 60000
```

| Instant | Counts? |
|---|---|
| `t + 59999` | yes, caller still blocked |
| `t + 60000` | no |
| `t + 60001` | no, exactly one slot freed |

A fixed sixty-second bucket satisfies every other line in this contract and fails this table. That
is why the table is here.
