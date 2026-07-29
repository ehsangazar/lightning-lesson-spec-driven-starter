# Quickstart: Items API

**Feature**: [spec.md](./spec.md) | **Contract**: [contracts/http-api.md](./contracts/http-api.md)

How to run the service and prove it does what the spec says. Everything below is runnable as
written.

## Prerequisites

- **Node 22.6 or later.** Not Node 20, despite what `package.json` currently claims. See
  research [R2](./research.md) for why, and the plan's Complexity Tracking for the fix.
- Nothing else. There are no runtime dependencies to install.

```bash
node --version    # must be >= 22.6.0
npm ci
```

## Checks

```bash
npm run typecheck    # tsc --noEmit, no build output
npm test             # vitest run
```

Both must pass before the service is worth starting. `typecheck` is the only thing enforcing
Principle I, since nothing compiles at run time.

## Run it

```bash
npm start                    # listens on 3000
PORT=3199 npm start          # or pick a port
```

`PORT` is the only environment variable, and `src/server.ts` is the only file that reads it.

## Validate against the contract

With the service running on 3199, each command below maps to a requirement. Expected output is
exact.

```bash
# FR-001, FR-014: health, independent of stored data
curl -s localhost:3199/health
# {"ok":true}

# FR-006: a service that has recorded nothing returns an empty collection, not a 404
curl -s localhost:3199/items
# []

# FR-002, FR-003, FR-004: create, and get back an id you did not supply
curl -s -X POST localhost:3199/items \
  -H 'content-type: application/json' -d '{"name":"widget"}'
# {"id":"1","name":"widget"}

# FR-005: creation order, bare list
curl -s localhost:3199/items
# [{"id":"1","name":"widget"}]

# FR-009a: surrounding whitespace is trimmed before storing
curl -s -X POST localhost:3199/items \
  -H 'content-type: application/json' -d '{"name":"  spaced  "}'
# {"id":"2","name":"spaced"}

# FR-008: unknown path
curl -s -w ' [%{http_code}]' localhost:3199/nope
# {"error":"not_found"} [404]

# FR-008: defined path, undefined method. A 404, not a 405
curl -s -w ' [%{http_code}]' -X DELETE localhost:3199/items
# {"error":"not_found"} [404]

# FR-008: path matching is exact, so a trailing slash is a different path
curl -s -w ' [%{http_code}]' localhost:3199/health/
# {"error":"not_found"} [404]

# FR-009: unreadable body
curl -s -w ' [%{http_code}]' -X POST localhost:3199/items \
  -H 'content-type: application/json' -d '{oops'
# {"error":"bad_request"} [400]

# FR-009: readable body, unusable name
curl -s -w ' [%{http_code}]' -X POST localhost:3199/items \
  -H 'content-type: application/json' -d '{"name":"   "}'
# {"error":"bad_request"} [400]

# FR-010: nothing was recorded by either rejection
curl -s localhost:3199/items
# [{"id":"1","name":"widget"},{"id":"2","name":"spaced"}]
```

## Validate what curl cannot reach

Two requirements are not observable from a shell against a running server.

**FR-007, restart empties the collection.** Do not test this by restarting a process. Construct
a fresh store instead: a new `createStore()` is what a restart produces, and asserting on it
keeps the suite free of process management (Principle III).

**FR-015, unexpected failure becomes a 500.** There is no way to make the real service fail on
demand, which is the point of the injection seam. Pass `createApp` a store whose `create`
throws, drive the handler directly, and assert `500` with `{"error":"internal_error"}`. See
research [R4](./research.md).

Both belong in `tests/api.test.ts`. Note that file is behind the Principle V fence, so those
tests are authored by a maintainer, not by an agent. That is recorded in the plan's Complexity
Tracking and is the reason gate V does not pass.

## Current state

At the time of writing, the curl block above passes in full against `src/`. The two items in
the section immediately above do not: FR-015 is specified but not implemented, and research
[R3](./research.md) verified that an unhandled throw currently ends the process rather than
producing a `500`.
