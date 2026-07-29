---

description: "Task list for per-client rate limiting"
---

# Tasks: Per-Client Rate Limiting

**Input**: Design documents from `/specs/002-rate-limit/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/rate-limit.md](./contracts/rate-limit.md)

**Tests**: MANDATORY (Constitution III). SC-008 requires every behaviour to be verifiable without
waiting in real time, which is only possible because `now` is a parameter.

**[FENCED]**: touches `tests/api.test.ts`, denied repo-wide by
[`constraints.md`](../../constraints.md). Authored by a maintainer, not an agent.

## Read this before starting

Nothing here exists yet. Unlike feature 001, this is a genuine greenfield delta: one new file, one
modified file.

The whole feature turns on one line, and a plausible implementation gets it wrong:

```text
a hit counts while  now - hitTime < 60000
```

A fixed sixty-second bucket satisfies User Story 1, User Story 3, User Story 4 and User Story 5
completely, and fails every scenario in User Story 2. T009 to T013 are the tasks that catch it.

---

## Phase 1: Setup

- [x] T001 No setup required. Zero new dependencies, no configuration, no new test root. The
      project structure from feature 001 is sufficient

---

## Phase 2: Foundational (Blocking Prerequisites)

- [ ] T002 Create `src/rate-limit.ts` exporting `RateLimitDecision`, `RateLimiter`,
      `RateLimiterOptions` and `createRateLimiter` per
      [data-model.md](./data-model.md). Import nothing from the project (FR-017)
- [ ] T003 Implement argument validation in `src/rate-limit.ts`: `RangeError` for a non-positive
      or non-finite `limit` or `windowMs`, `TypeError` for a non-string key or non-finite `now`
      (Constitution IV)

**Checkpoint**: The module exists and its shape is fixed. User stories can proceed.

---

## Phase 3: User Story 1 - A noisy caller degrades only itself (Priority: P1)

**Goal**: One caller exceeding its allowance changes nothing for anyone else.

**Independent Test**: Drive one key past the limit and a second key once. First refused, second
served.

### Tests (MANDATORY)

- [ ] T004 [P] [US1] **[FENCED]** Ten requests on one key are all allowed, the eleventh is not, in
      `tests/api.test.ts` (FR-001)
- [ ] T005 [P] [US1] **[FENCED]** A blocked key does not affect a second key's allowance, in
      `tests/api.test.ts` (FR-003, SC-001)
- [ ] T006 [P] [US1] **[FENCED]** Same address, different `X-Client-Id`, counted separately, in
      `tests/api.test.ts` (FR-002)
- [ ] T007 [P] [US1] **[FENCED]** No `X-Client-Id`, same address, counted together, and an empty
      header counts as absent, in `tests/api.test.ts` (FR-002)

### Implementation

- [ ] T008 [US1] Implement per-key hit tracking as `Map<string, number[]>` with prefix pruning and
      a length comparison in `src/rate-limit.ts` (FR-001, FR-003, research [R1](./research.md))
- [ ] T009 [US1] Derive the key in `src/app.ts` from `X-Client-Id` when present and non-empty,
      otherwise `ip`, with a shared fallback when no address is available (FR-002, research
      [R5](./research.md))

---

## Phase 4: User Story 2 - The window slides (Priority: P1)

**Goal**: Allowance returns one slot at a time as each hit ages out, never all at once.

**Independent Test**: Ten hits at `t`, refused at `t + 59999`, exactly one allowed at `t + 60001`.

**This phase is the feature.** Everything else is scaffolding around it.

### Tests (MANDATORY)

- [ ] T010 [P] [US2] **[FENCED]** Refused at `t + 59999` after ten hits at `t`, in
      `tests/api.test.ts` (FR-005, SC-002)
- [ ] T011 [P] [US2] **[FENCED]** Exactly one request allowed at `t + 60001`, and the next one
      refused, in `tests/api.test.ts` (FR-005, SC-003). Asserting the *second* call is refused is
      what distinguishes a sliding window from a bucket
- [ ] T012 [P] [US2] **[FENCED]** The exact boundary: a hit made at `t` no longer counts at
      `t + 60000`, in `tests/api.test.ts` (research [R3](./research.md))
- [ ] T013 [P] [US2] **[FENCED]** Hits made at different moments free independently and in order,
      in `tests/api.test.ts` (FR-004)
- [ ] T014 [P] [US2] **[FENCED]** A caller that retries throughout the block recovers at the same
      instant as one that waited quietly, in `tests/api.test.ts` (FR-008, SC-006)

### Implementation

- [ ] T015 [US2] Implement expiry as `now - hitTime < windowMs` in `src/rate-limit.ts` (FR-004,
      FR-005). Strictly less than, not less than or equal
- [ ] T016 [US2] Do not record a hit when the decision is refused, in `src/rate-limit.ts` (FR-008)

---

## Phase 5: User Story 3 - A refused caller is told what to do (Priority: P2)

**Goal**: A client can act on a refusal from the response alone.

**Independent Test**: Read the remaining allowance counting down, then read the retry delay from a
refusal.

### Tests (MANDATORY)

- [ ] T017 [P] [US3] **[FENCED]** All three headers present on allowed and refused responses
      alike, in `tests/api.test.ts` (FR-009)
- [ ] T018 [P] [US3] **[FENCED]** Remaining counts `9, 8, 7` and pins at `0` when refused, never
      negative, in `tests/api.test.ts` (FR-011)
- [ ] T019 [P] [US3] **[FENCED]** `X-RateLimit-Reset` is unix **seconds**, not milliseconds, in
      `tests/api.test.ts` (FR-010). Assert the magnitude, not just presence
- [ ] T020 [P] [US3] **[FENCED]** `Retry-After` is a whole number and never below `1`, in
      `tests/api.test.ts` (FR-007, SC-004)
- [ ] T021 [P] [US3] **[FENCED]** A refusal returns `429` with `{"error":"rate_limited"}`, in
      `tests/api.test.ts` (FR-006)

### Implementation

- [ ] T022 [US3] Compute `remaining`, `resetAt` and `retryAfter` on the decision in
      `src/rate-limit.ts`, with `Math.max(1, Math.ceil(...))` for the delay (FR-007, FR-011,
      research [R4](./research.md))
- [ ] T023 [US3] Attach the three headers in `src/app.ts`, converting `resetAt` from milliseconds
      to seconds exactly once (FR-009, FR-010)
- [ ] T024 [US3] Return `429` with `{"error":"rate_limited"}` and `Retry-After` in `src/app.ts`
      (FR-006, FR-007)

---

## Phase 6: User Story 4 - Liveness checks are never refused (Priority: P2)

**Goal**: A monitor is never the casualty of rate limiting.

**Independent Test**: Poll `/health` well past the limit. All served, none carrying headers.

### Tests (MANDATORY)

- [ ] T025 [P] [US4] **[FENCED]** `/health` served at any volume, including from an already
      blocked key, in `tests/api.test.ts` (FR-012)
- [ ] T026 [P] [US4] **[FENCED]** `/health` responses carry no rate-limit headers at all, in
      `tests/api.test.ts` (FR-013)
- [ ] T027 [P] [US4] **[FENCED]** `/health` requests consume no allowance that other routes would
      have used, in `tests/api.test.ts` (FR-012)

### Implementation

- [ ] T028 [US4] Add `exempt?: string[]` to `AppOptions` defaulting to `['/health']`, and check it
      before consulting the limiter, in `src/app.ts` (FR-012, FR-013)

---

## Phase 7: User Story 5 - Memory does not grow without bound (Priority: P3)

**Goal**: Quiet callers stop being tracked.

**Independent Test**: Track several keys, advance past the window, read the count.

### Tests (MANDATORY)

- [ ] T029 [P] [US5] **[FENCED]** Tracked key count falls to zero once every key's hits expire, in
      `tests/api.test.ts` (FR-014, SC-007)
- [ ] T030 [P] [US5] **[FENCED]** An active key survives a sweep while quiet ones are dropped, in
      `tests/api.test.ts` (FR-014)

### Implementation

- [ ] T031 [US5] Implement `size(now: number): number` in `src/rate-limit.ts`, sweeping expired
      keys before counting (FR-014, FR-015, research [R2](./research.md))

---

## Phase 8: Polish & Cross-Cutting

- [ ] T032 Wire the limiter into `createApp` in `src/app.ts`: accept `limiter?: RateLimiter` in
      `AppOptions`, default to `createRateLimiter({ limit: 10, windowMs: 60_000 })`, and consult
      it before routing (FR-001, research [R6](./research.md))
- [ ] T033 Confirm the existing feature 001 regression tests still pass untouched. A rate limiter
      that breaks the items API has not shipped
- [ ] T034 Run `npm run gate` and confirm paths, types and tests are all green
- [ ] T035 Walk the curl block in [quickstart.md](./quickstart.md) against a running service

---

## Dependencies & Execution Order

- **T002, T003** block everything. The module shape must exist first
- **T008** blocks T015 and T016, same file, same structure
- **T032** depends on T008, T022 and T028: it is the wiring, and it goes last
- **User Stories 1 to 5** are otherwise independent and can proceed in parallel

### The fence

**Twenty of thirty-five tasks are fenced**: T004 to T007, T010 to T014, T017 to T021, T025 to
T027, T029, T030. All write `tests/api.test.ts`.

Under Constitution III no implementation task may land before its tests exist and fail. So the
whole of Phases 3 to 7 is blocked until a maintainer writes them. An agent can do T002, T003 and
the implementation halves only once the corresponding tests are in.

If only one group gets written first, make it **T010 to T014**. Those are the five that a fixed
sixty-second bucket fails, and everything else in this spec passes without them.

## Implementation Strategy

1. A maintainer writes T010 to T014 and watches them fail
2. An agent does T002, T003, T008, T015, T016: the sliding window itself
3. A maintainer writes the remaining fenced tests
4. An agent does T009, T022, T023, T024, T028, T031, T032
5. T033 to T035 confirm

Steps 1 and 3 are the human half. That is not a limitation of the tooling, it is the method: the
criterion that kills the plausible-but-wrong implementation is written before anything is pointed
at the problem.
