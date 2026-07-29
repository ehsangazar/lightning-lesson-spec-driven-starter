# Implementation Plan: Items API

**Branch**: `001-items-api` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-items-api/spec.md`

## Summary

A three-route JSON service over `node:http` with no framework and no runtime dependencies.
Item storage is a pure module, the request handler is a pure function built from injected
dependencies, and exactly one file opens a socket or reads the environment.

Most of this already exists in `src/`. The plan is therefore mostly a delta, and the delta is
driven by one requirement: FR-015, added during clarification, says an unexpected failure must
become a `500` and must not end the process. Research R3 verified that the current code does
the opposite, so this is real work rather than paperwork.

Approach: move the mapping from "handler threw" to "500 response" into `src/app.ts` where it
has a test seam, leave `src/server.ts` with a thin outer guard for failures that happen before
the handler is reached, and replace one `as` cast that Principle I forbids.

## Technical Context

**Language/Version**: TypeScript 5.7 on Node 22.6+ via built-in type stripping, no build step.
See research R2: `package.json` currently claims Node 20, which is wrong.

**Primary Dependencies**: None at runtime, by constitutional rule. Development only:
`vitest` 3, `typescript` 5.7, `@types/node` 22.

**Storage**: In-memory, for the lifetime of the process. Uncapped (FR-007a). No persistence.

**Testing**: Vitest, `tests/**/*.test.ts`. Handler driven directly, no sockets, no timers.

**Target Platform**: Node server process, single instance.

**Project Type**: Single-project web service.

**Performance Goals**: None specified. The spec's Success Criteria are behavioural rather than
timing-based, and clarification left performance Outstanding as low impact.

**Constraints**: Zero runtime dependencies. `strict` on, no `any`, no silencing `as`. Business
logic pure. One file owns sockets, environment, and the clock. Collection uncapped, so memory
grows with usage until restart.

**Scale/Scope**: 3 routes, 2 entities, 3 source files, 1 test file. 17 functional requirements.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Answer each gate with a concrete reference to this plan. A "no" is either designed out or
recorded in Complexity Tracking below.

- [x] **I. Node and TypeScript** - Node 22.6+ (see R2), `strict` on, `dependencies` is empty
      and stays empty. No `any` and no bare `@ts-expect-error` anywhere in `src/`. The one
      offending `as` at `src/app.ts:48` is removed by this plan per R5. `createApp`,
      `createStore` and the new helpers all carry explicit parameter and return types.
- [x] **II. Pure core, one impure edge** - `src/store.ts` and `src/app.ts` are pure.
      `src/server.ts` is the only file that touches sockets, `process.env`, or `Date.now()`,
      verified by grep during the compliance review. Nothing in this feature is
      time-dependent, so no `now: number` threading is required; identifiers come from a
      counter, not a clock. One exported concern per file.
- [x] **III. Behaviour-first testing** - Every requirement is reachable through `createApp`
      and `createStore`. No sleeps, timers, or network. FR-015 is testable because storage is
      injectable, so a store rigged to throw exercises the failure path (R4). Order
      independence holds because each test constructs its own app.
- [x] **IV. Fail loud** - The pure layer throws on programmer error and nothing catches and
      discards. The `500` mapping is translation at a boundary, not swallowing: the error is
      logged, and the caller is told the service failed rather than being handed a success.
- [ ] **V. The agent fence** - **This gate does not pass.** See Complexity Tracking.

### Why gate V fails, and what it exposes

FR-015 is new behaviour. Principle III requires new behaviour to land with its acceptance
tests. Principle V forbids an agent from creating or modifying the test suite. Taken together
and applied to an agent working alone, the two principles are unsatisfiable: III demands the
tests, V forbids writing them.

This is not a defect in the plan, it is the constitution working as intended. The repository's
method puts the acceptance test in a human's hands *before* the agent is pointed at anything,
so the resolution is procedural rather than technical: the FR-015 acceptance tests are authored
by the maintainer, and implementation proceeds against them. Recorded rather than designed
around, exactly as Principle V instructs.

### Post-design re-check

Re-evaluated after Phase 1. No gate changed state. The two design decisions that could have
moved one did not:

- **Counter-based identifiers** (data-model) keep Principle II intact. A timestamp identifier
  would have put a clock read in `src/store.ts` and failed gate II.
- **Error-to-response mapping in `app.ts` rather than `server.ts`** (research R4) keeps gate
  III honest. Putting the whole `500` path in `server.ts` would have left FR-015 with no test
  seam at all, which is a worse failure than the one recorded below.

Gate V remains the only failure, and it is procedural rather than technical.

## Project Structure

### Documentation (this feature)

```text
specs/001-items-api/
├── spec.md              # Feature specification
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── http-api.md      # Phase 1 output (/speckit-plan command)
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit-specify command output)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── store.ts             # Item storage. Pure. Knows nothing about HTTP
├── app.ts               # Request handler as a pure function. Knows nothing about sockets
└── server.ts            # The only impure file: sockets, environment, clock, body reading

tests/
└── api.test.ts          # Regression and acceptance suite, drives app.ts directly
```

**Structure Decision**: Single project, three source files, flat. No `models/`, `services/` or
`lib/` subdivision, because Principle II's "one exported concern per file" is already satisfied
by three files and directories with one file each are organisational theatre. The layering that
matters is enforced by which file may import what, not by folder depth:

- `store.ts` imports nothing from the project
- `app.ts` imports `store.ts`
- `server.ts` imports `app.ts` and is the only file importing `node:http`

Regression tests stay in `tests/` per the user's stated layout. Acceptance coverage for this
feature lands in the same file rather than a parallel `spec/` tree, because `specs/` in a
spec-kit layout holds documents, not executable tests, and a second test root with one file in
it would be the same theatre as above.

## Delta: what actually changes

Existing code already satisfies FR-001 through FR-014. The remaining work:

| Change | File | Requirement | Fenced |
|---|---|---|---|
| Map a thrown handler error to `500` `internal_error` | `src/app.ts` | FR-015 | no |
| Outer guard for failures before the handler runs | `src/server.ts` | FR-015 | no |
| Replace the `as` cast with a narrowing predicate | `src/app.ts` | Principle I | no |
| Acceptance tests for the failure path | `tests/api.test.ts` | FR-015, III | **yes** |
| Correct `engines.node` from `>=20` to `>=22.6` | `package.json` | R2 | adjacent |

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Gate V: FR-015 requires new acceptance tests in `tests/api.test.ts`, which an agent may not create or modify | FR-015 is behaviour the spec now mandates and the code does not have. Principle III requires it to ship with tests. Without those tests the failure path is asserted nowhere | Implementing FR-015 untested was rejected: it fails Principle III and leaves the one requirement whose whole point is resilience with no proof. Dropping FR-015 was rejected: the user chose it explicitly in clarification. The remaining route is a human authoring the tests, which is the repository's stated method rather than a workaround |
| `package.json` `engines.node` states `>=20` while the start script needs 22.6+ (R2) | Leaving it misleads anyone on Node 20, who gets a clean install and a green test run before discovering the server will not start | Changing it silently was rejected: `package.json` sits next to the fenced configuration files, and a version floor is a maintainer's call. Flagged here for a one-word fix rather than made unilaterally |
