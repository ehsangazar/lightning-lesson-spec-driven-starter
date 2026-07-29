# Implementation Plan: Per-Client Rate Limiting

**Branch**: `002-rate-limit` | **Date**: 2026-07-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-rate-limit/spec.md`

## Summary

A new pure module, `src/rate-limit.ts`, holds a sliding window of hit timestamps per key and
answers one question: may this key proceed at this instant. It takes `now: number` and a string
key, and knows nothing about HTTP.

`src/app.ts` becomes the only other file that changes: it derives the key from headers or address,
consults the limiter before routing, and attaches the reporting headers. Nothing else moves.

The whole feature is designed around one boundary, stated in the spec and repeated here because
everything else follows from it: a hit counts while it is **strictly less than** 60000 ms old.

## Technical Context

**Language/Version**: TypeScript 5.7 on Node 22.6+, type stripping, no build step.

**Primary Dependencies**: none at runtime. Development only: `vitest`, `typescript`, `@types/node`.

**Storage**: In-memory, per process. A `Map<string, number[]>` of key to hit timestamps.

**Testing**: Vitest, driving `createRateLimiter` and `createApp` directly. No real time passes.

**Target Platform**: Node server process, single instance.

**Project Type**: Single-project web service.

**Performance Goals**: None specified. With a limit of ten, per-key work is bounded at ten
timestamps, so the naive structure is also the right one.

**Constraints**: Zero runtime dependencies. Limiter never reads the clock (FR-016) and never sees
a request (FR-017). Fixed limit and window, no configuration surface.

**Scale/Scope**: 1 new file, 1 modified file, 17 functional requirements, 5 user stories.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Node and TypeScript** - No new dependencies. `strict` stays on. `createRateLimiter`,
      `check` and `size` all carry explicit parameter and return types. No `as`, no `any`.
- [x] **II. Pure core, one impure edge** - `src/rate-limit.ts` is pure and takes `now: number`
      on every method that needs time, which is FR-016 restated. `src/server.ts` remains the only
      file calling `Date.now()`, and it already passes `now` into `AppRequest`. This feature is
      the reason that field exists.
- [x] **III. Behaviour-first testing** - Every requirement is reachable through
      `createRateLimiter` and `createApp`. Time is a parameter, so the entire sliding window is
      exercised by passing numbers. No sleeps, no timers, no network. SC-008 makes this explicit.
- [x] **IV. Fail loud** - `createRateLimiter` throws `RangeError` for a limit or window that is
      not a positive finite number, and `check` throws `TypeError` for a non-string key or a
      non-finite `now`. These are programmer errors, not caller errors, so they throw rather than
      returning a decision.
- [ ] **V. The agent fence** - **Does not pass**, for the same reason as feature 001. See
      Complexity Tracking.

### Post-design re-check

No gate changed state after Phase 1. The design decision that could have moved one is the
pruning strategy: `size(now)` takes time as a parameter rather than reading a clock, which keeps
gate II intact and makes FR-015 assertable. See research [R2](./research.md).

## Project Structure

### Documentation (this feature)

```text
specs/002-rate-limit/
├── spec.md
├── plan.md              # This file
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── rate-limit.md
└── tasks.md             # /speckit-tasks output
```

### Source Code (repository root)

```text
src/
├── store.ts             # Unchanged
├── rate-limit.ts        # NEW. Sliding window per key. Pure, clock-free, HTTP-free
├── app.ts               # MODIFIED. Derives the key, consults the limiter, adds headers
└── server.ts            # Unchanged. Already passes `now` and `ip` into AppRequest

tests/
└── api.test.ts          # Acceptance tests. FENCED
```

**Structure Decision**: The limiter is a sibling of `store.ts`, not a layer above or below it.
Both are pure state holders that `app.ts` composes. The layering rule stays: `rate-limit.ts`
imports nothing from the project, exactly like `store.ts`.

`app.ts` is the only file that knows a rate limit exists *and* that HTTP exists. That split is
FR-017: the limiter takes a string key because deriving that key from a header or an address is
transport knowledge, and transport knowledge lives in `app.ts`.

## Delta: what actually changes

| Change | File | Requirement |
|---|---|---|
| New sliding-window limiter, pure, `now`-parameterised | `src/rate-limit.ts` | FR-001, FR-004, FR-005, FR-008, FR-014, FR-016, FR-017 |
| Key derivation from header or address | `src/app.ts` | FR-002, FR-003 |
| Consult limiter before routing, refuse with `429` | `src/app.ts` | FR-006, FR-007 |
| Reporting headers on non-exempt responses | `src/app.ts` | FR-009, FR-010, FR-011 |
| Health exemption, no headers | `src/app.ts` | FR-012, FR-013 |
| Tracked key count exposed | `src/rate-limit.ts` | FR-015 |
| Acceptance tests | `tests/api.test.ts` | **FENCED** |

Nothing in `src/server.ts` or `src/store.ts` changes. `AppRequest` already carries `ip` and `now`,
which were added in anticipation of exactly this feature.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Gate V: every acceptance test for this feature lands in `tests/api.test.ts`, which an agent may not create or modify | The spec's whole value is the sliding-window boundary, and a boundary with no test is a boundary that will be got wrong. Principle III requires the tests to ship with the behaviour | Shipping the limiter untested was rejected: a fixed-bucket implementation passes every scenario in User Story 1 and fails every scenario in User Story 2, and without tests nothing catches that. Splitting the tests into a new file was rejected as routing around the fence rather than reporting it |
| Feature 001's FR-015 (unexpected failure returns `500`) is still unimplemented and still blocked | This feature adds a code path that runs *before* routing, widening the surface where an unexpected throw can occur | Not a reason to skip 001's blocker. Recorded so it is visible that two features now depend on the same unblocking |
