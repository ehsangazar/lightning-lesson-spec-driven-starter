# Phase 0 Research: Per-Client Rate Limiting

**Feature**: [spec.md](./spec.md) | **Date**: 2026-07-29

## R1: What structure holds a sliding window?

**Decision**: `Map<string, number[]>`, key to an ascending array of hit timestamps. On each
check, drop the leading entries that have aged out, then compare length against the limit.

**Rationale**: The limit is ten, so each array holds at most ten numbers and the "expensive"
prune is a walk of ten elements. A ring buffer or a deque would be faster in principle and
identical in practice at this size, while being harder to read. Timestamps arrive in ascending
order because `now` only moves forward, so expired entries are always a prefix, and pruning is a
single `findIndex` plus `slice`.

**Alternatives considered**:

- **A counter plus a window start** is the fixed-bucket design this spec exists to rule out. It
  passes every scenario in User Story 1 and fails all five in User Story 2.
- **Two counters, current and previous window, weighted by position** is the standard approximate
  sliding window. It is cheaper and wrong at the boundary, which is the one place this spec is
  precise about.

## R2: When are expired keys dropped? (FR-014, FR-015)

**Decision**: `check(key, now)` prunes the key it touches. `size(now)` prunes every key before
counting, and takes `now` for that reason.

**Rationale**: This is the design decision that most affects testability. If pruning happened only
on `check`, a key that went quiet would never be visited again and would sit in the map forever,
so FR-014 would be false in exactly the case it exists to cover. Making `size` take `now` and
sweep means the memory bound is a property a test can assert directly, which is what FR-015 asks
for.

It also keeps Principle II intact: `size` needs to know the time to decide what is expired, and
the constitution's answer to "needs the time" is always a parameter, never a clock read.

**Alternatives considered**:

- **A timer that sweeps periodically**: needs a real clock and a real timer, so it fails
  Principle III's no-timers rule and makes the suite time-dependent. Rejected outright.
- **Sweep on every check, across all keys**: correct, but turns a per-key operation into a
  whole-map walk on the hot path for no benefit the spec asks for.

## R3: Which side of the boundary does a hit at exactly 60000 ms fall?

**Decision**: A hit counts while `now - hitTime < windowMs`. At exactly `t + 60000 ms` the hit has
stopped counting.

**Rationale**: The prompt pins `t + 59999` (still blocked) and `t + 60001` (one slot freed), and
both readings of the instant between them satisfy those two points. The tiebreak is the prompt's
own wording, "each hit stops counting exactly 60000 ms after it happened": at exactly 60000 ms
after, it has stopped.

Verified against both pinned points under this rule:

| Instant | `now - hitTime` | Counts? | Spec says |
|---|---|---|---|
| `t + 59999` | 59999 | yes, `59999 < 60000` | still blocked |
| `t + 60000` | 60000 | no, `60000 < 60000` is false | not pinned by the prompt |
| `t + 60001` | 60001 | no | exactly one slot freed |

This is recorded as an edge case in the spec rather than left to the implementation, because it is
the single instant where a reasonable reader could go either way, and a spec that leaves it open
has left the feature open.

## R4: What does `Retry-After` report, and why never below one?

**Decision**: `Math.max(1, Math.ceil((oldestHit + windowMs - now) / 1000))`.

**Rationale**: Two separate corrections, each doing real work. `ceil` means a client that waits the
reported number of seconds has waited at least as long as it needed, never a fraction short.
`Math.max(1, ...)` covers the case where the next slot frees in under a second, where a truthful
`0` would invite an immediate retry that gets refused again. FR-007 states both.

The same rounding applies to `X-RateLimit-Reset` (FR-010), so a reset never reads as already past.

**Alternatives considered**: reporting milliseconds. Rejected because `Retry-After` is defined in
seconds, and because the spec is explicit that the reset is seconds, in every response, without
exception. That "without exception" is there because mixed units are the failure mode.

## R5: Where does key derivation live?

**Decision**: In `src/app.ts`, not in `src/rate-limit.ts`.

**Rationale**: FR-017 says the limiter takes a key as text and knows nothing about HTTP. A header
name and a network address are transport concepts, so deriving one from the other is transport
work. Putting it in the limiter would make the limiter untestable without constructing fake
requests, which is the coupling FR-017 exists to prevent.

An empty header is treated as absent, per the spec's edge case. That check belongs with the
derivation, in `app.ts`.

## R6: Does rate limiting run before or after routing?

**Decision**: Before. An unknown path still costs a slot.

**Rationale**: Recorded in the spec's Assumptions. If limiting ran after routing, a refused caller
could probe for valid routes at no cost, and the `404` path would be an unlimited surface. Running
first also means one code path attaches the headers rather than every route doing it.

The health exemption is checked before the limiter, so FR-012 and FR-013 hold at any volume.

## Summary

| Finding | Effect on implementation |
|---|---|
| R1 | `Map<string, number[]>`, prune a prefix, compare length |
| R2 | `size(now)` sweeps and takes time as a parameter |
| R3 | `now - hitTime < windowMs`. The single most important line in the feature |
| R4 | `Math.max(1, Math.ceil(...))` for both retry delay and reset |
| R5 | Key derivation in `app.ts`, limiter stays HTTP-free |
| R6 | Limiter runs before routing, after the health exemption |
