# Quickstart: Per-Client Rate Limiting

**Feature**: [spec.md](./spec.md) | **Contract**: [contracts/rate-limit.md](./contracts/rate-limit.md)

## Prerequisites

Node 22.6+, `npm ci`. Same as [feature 001](../001-items-api/quickstart.md). No new dependencies.

## Checks

```bash
npm run typecheck
npm test
npm run gate        # paths, then types, then tests
```

## Validate by hand

With the service running on 3199, eleven requests from one key:

```bash
for i in $(seq 1 11); do
  curl -s -o /dev/null -D - -H 'X-Client-Id: alice' localhost:3199/items \
    | grep -iE 'HTTP/|x-ratelimit-|retry-after'
done
```

Expected: ten `200`s with `X-RateLimit-Remaining` counting `9` down to `0`, then a `429` carrying
`{"error":"rate_limited"}`, `Retry-After: 60`, and `X-RateLimit-Remaining: 0`.

Then confirm isolation and the exemption:

```bash
# A different key is untouched by alice being blocked
curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Client-Id: bob' localhost:3199/items
# 200

# Health is never limited and carries no rate-limit headers
curl -s -D - -H 'X-Client-Id: alice' localhost:3199/health | grep -ic x-ratelimit
# 0
```

## Validate what curl cannot reach

This is most of the feature, and it is the reason `now` is a parameter.

**The sliding window** cannot be checked by hand without waiting a real minute, and a test that
waits a real minute is a test nobody runs. Drive `createRateLimiter` directly and pass numbers:

| Assert | Call |
|---|---|
| Ten allowed, eleventh refused | `check('a', 0)` ten times, then once more at `0` |
| Still blocked just before the window | `check('a', 59999)` |
| Exactly one slot freed | `check('a', 60001)` allowed, the next call at `60001` refused |
| The exact boundary | `check('a', 60000)` allowed, per research [R3](./research.md) |
| Refusals cost nothing | Refuse repeatedly between `0` and `59999`, then confirm recovery is still at `60000` |
| Keys are dropped | `size(60000)` returns `0` after all hits expire |

**The unit of `X-RateLimit-Reset`** is seconds while `resetAt` is milliseconds. Assert the header
value is roughly `Date.now()/1000`, not `Date.now()`. A test that only checks the header exists
will not catch a factor of a thousand.

All of these belong in `tests/api.test.ts`, which is denied by
[`constraints.md`](../../constraints.md), so they are written by a human before an agent is
pointed at anything.

## Current state

Not implemented. `src/rate-limit.ts` does not exist and `src/app.ts` does not consult a limiter,
so every command above currently returns an unlimited `200` with no rate-limit headers.
