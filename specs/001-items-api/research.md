# Phase 0 Research: Items API

**Feature**: [spec.md](./spec.md) | **Date**: 2026-07-28

Six questions had to be answered before the design could be fixed. Three were verified by
running code rather than by recall, and those are marked **verified**.

---

## R1: How does TypeScript run without a build step?

**Decision**: Node's built-in type stripping, invoked as `node --experimental-strip-types
src/server.ts`. No compiler in the run path, no emitted JavaScript, no `dist/`. `tsc` is used
only as a checker, via `tsc --noEmit`.

**Rationale**: A build step is a second source of truth about what runs. Stripping removes the
gap between the file you read and the file that executes, which matters more than usual here
because the constitution forbids the dependencies that a bundler would bring. Types are still
enforced, just by a separate `npm run typecheck` rather than as a side effect of building.

**Alternatives considered**:

- **`tsc` emitting to `dist/`**: adds a build artifact, a stale-output failure mode, and a
  `dist` path in every stack trace. Rejected as unnecessary for three source files.
- **`tsx` or `ts-node`**: both are runtime dependencies in all but name, and Principle I says
  Node's standard library is the whole toolbox. Rejected.

---

## R2: What is the real minimum Node version? (verified)

**Decision**: The floor is **Node 22.6**, not the Node 20 that `package.json` advertises.

**Rationale**: `--experimental-strip-types` was added in Node 22.6. On Node 20 the flag does
not exist, so `npm start` fails outright. The repository already knows this and contradicts
itself about it:

| Source | Claim |
|---|---|
| `package.json:8` | `"node": ">=20"` |
| `src/server.ts:8` | `requires Node 22.6+ for TypeScript stripping` |
| `.specify/memory/constitution.md` Principle I | "targets Node 20 or later" |

Verified on the development machine (Node 23.11): a `.ts` file runs with no flag at all, since
stripping became default-on after 22.6, emitting only an `ExperimentalWarning`. So the working
range is 22.6+, and Node 20 is broken for `npm start` while still fine for `npm test`, because
Vitest does its own transform and never asks Node to read TypeScript.

That last detail is why the contradiction has gone unnoticed: the test suite passes on Node
20, so CI would be green on a version the server cannot start on.

**Impact**: this is a documentation defect, not a design decision, and the fix is one number.
It is recorded in the plan's Complexity Tracking because `package.json` is adjacent to the
Principle V fence and this plan does not change it unilaterally.

**Alternatives considered**:

- **Lower the floor by adding a build step**: would make Node 20 genuinely work, at the cost
  of R1. Rejected, the constraint is worth more than the two versions.
- **Leave `engines` alone**: rejected as actively misleading. Someone on Node 20 installs
  cleanly, tests green, and discovers the problem only when they try to run the thing.

---

## R3: What happens when the request handler throws? (verified)

**Decision**: The failure must be caught in `src/server.ts`. Nothing else will catch it.

**Rationale**: FR-015 requires a `500` and a surviving process. A throw inside the
`req.on('end', ...)` listener does not become a failed response, it becomes an uncaught
exception, and Node's default behaviour for that is to terminate. Verified directly: a
minimal `node:http` server whose `end` listener throws printed a stack trace and exited. The
client saw a dropped socket, and the "process still alive" line queued behind it never ran.

So the current `src/server.ts` violates FR-015 today. This is not a hypothetical.

**Design**: wrap the body of the `end` listener in `try`/`catch`. The `catch` logs and writes
`500` with `{"error": "internal_error"}`. This does not conflict with Principle IV: the pure
layer still throws loudly on programmer error, and the server layer is the boundary that turns
a thrown error into a response rather than discarding it. Principle IV forbids swallowing an
error to keep a test green, not translating one at the edge.

**Alternatives considered**:

- **`process.on('uncaughtException')`**: catches it, but by then the response object is out of
  reach, so the caller still gets a dropped connection. Solves the wrong half.
- **Let it crash and rely on a supervisor**: rejected by the user in clarification, and it
  fails FR-012 for every other in-flight caller.

---

## R4: How is the FR-015 failure path tested without sockets?

**Decision**: Inject a `Store` whose `create` throws, then drive `createApp` directly.

**Rationale**: `createApp` already takes its store as an option, which is the seam. A store
that throws on `create` reaches the same code path a genuine defect would, with no socket, no
timer, and no process manipulation. This is the one place the spec's "rigged to fail" scenario
becomes concrete.

Note the split: the *handler* returning `500` is testable this way, but the *server* catching
a throw is in `src/server.ts`, which by design has no test seam. Two options, decided in the
plan: either the catch lives in `server.ts` and stays unit-untested, or the mapping from
"thrown" to "500 response" moves into `app.ts` where it can be driven. The plan chooses the
second, so the tested surface covers the behaviour and `server.ts` keeps only the parts that
genuinely need a socket.

**Alternatives considered**:

- **Spin a real server on a port and assert over HTTP**: violates Principle III's no-network
  rule and makes the suite order-dependent on port availability. Rejected.

---

## R5: Can the `as` cast in `src/app.ts` be removed?

**Decision**: Yes. Replace with a narrowing helper that returns `string | undefined`.

**Rationale**: `src/app.ts:48` currently reads
`(req.body as { name?: unknown } | undefined)?.name`. Principle I bans `as` used to silence a
compiler error, and this cast exists only because `unknown` will not index. A small predicate
that checks `typeof body === 'object' && body !== null && 'name' in body` narrows without
asserting, satisfies `strict`, and reads as the validation it actually is.

The cast is benign in effect, since the very next line checks `typeof name !== 'string'`. It is
still the letter of the rule, and removing it costs about four lines.

**Alternatives considered**:

- **Keep it and record a Complexity Tracking exception**: rejected. An exception is for
  complexity that buys something, and this buys nothing a predicate would not.

---

## R6: Does Vitest need configuring for extension-ful imports?

**Decision**: No change needed. Current `vitest.config.ts` and `tsconfig.json` already work.

**Rationale**: The source imports `./store.ts` with the extension, which Node requires for
stripping and which `tsconfig.json` permits via `allowImportingTsExtensions` alongside
`"moduleResolution": "Bundler"`. Vitest resolves these without extra configuration. Confirmed
by the suite running green after the reconciliation in this session.

Both files are behind the Principle V fence, so "no change needed" is the answer that matters.

**Alternatives considered**: none required.

---

## Summary of what this changes

| Finding | Effect on implementation |
|---|---|
| R2 | `package.json` `engines` is wrong. Flagged, not changed by this plan |
| R3 | `src/server.ts` must gain a `try`/`catch`. New work |
| R4 | Error-to-response mapping moves into `app.ts` so it can be tested. New work |
| R5 | `src/app.ts:48` cast replaced with a predicate. Small refactor |
| R1, R6 | Confirm existing setup, no change |
