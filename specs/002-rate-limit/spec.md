# Feature Specification: Per-Client Rate Limiting

**Feature Branch**: `002-rate-limit`

**Created**: 2026-07-29

**Status**: Draft

**Input**: User description: "Add per-client rate limiting so one noisy caller degrades only itself. Ten requests per sixty seconds per key. The key is the `X-Client-Id` header when present, otherwise the remote IP; distinct keys never affect each other. The window is sliding, not a fixed calendar bucket: each hit stops counting exactly 60000 ms after it happened, and each expires independently. At t = 59999 ms a blocked caller is still blocked; at t = 60001 ms exactly one slot has freed, not all ten. Over the limit responds 429 with `{ "error": "rate_limited" }` and a `Retry-After` header in whole seconds, never below 1. Every non-exempt response, allowed or rejected, carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`, where Reset is unix SECONDS, not milliseconds. Remaining counts down 9, 8, 7 and pins at 0 when blocked. Rejected requests do not consume a slot: being blocked must not extend the block. `/health` is never limited at any volume and carries no rate-limit headers. Keys whose hits have all expired are dropped, and the tracked key count is observable so the memory bound can be asserted. The limiter takes the current time as an argument and never reads the clock itself. It knows nothing about HTTP: it takes a string key, not a request. Not doing: distributed or cross-process limiting, per-endpoint or per-plan limits, configuration or env vars, persistence."

## Clarifications

### Session 2026-07-30

- Q: Can a caller get itself an unlimited allowance simply by sending a different `X-Client-Id`
  value on every request, or must its network address still cap it? → A: Trust the header. A
  rotating identifier does grant a fresh allowance; this is an accepted assumption, on the basis
  that the service sits behind a trusted caller boundary.
- Q: When no client identifier header is present, is the "network address" the direct socket
  address of whoever connected, or should a forwarding header such as `X-Forwarded-For` be
  consulted first? → A: The direct socket address only. Forwarding headers are never consulted.
- Q: When are expired keys actually removed from memory, only when something asks for the tracked
  key count, or does an ordinary request also clean up? → A: A request expires its own key's hits,
  and additionally triggers a full sweep at most once per window, so reclamation never depends on
  anything observing it.
- Q: When a test reads the tracked key count, should that read itself clean up expired keys first,
  or report exactly what is being held right now? → A: Report what is held right now. The read is a
  passive observation, takes no time argument, and sweeps nothing, so a leak stays visible to a
  test.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A noisy caller degrades only itself (Priority: P1)

One client sends far more requests than its share. It starts being refused, while every other
client continues to be served exactly as before, unaffected and unaware.

**Why this priority**: This is the entire point of the feature. Isolation between callers is the
property being bought; everything else is mechanism or reporting.

**Independent Test**: Drive one key past its allowance and a second key once. The first is
refused, the second succeeds. No other part of the feature needs to work for this to be testable.

**Acceptance Scenarios**:

1. **Given** a caller that has made no requests, **When** it makes ten in quick succession,
   **Then** all ten are served.
2. **Given** a caller that has just made ten requests, **When** it makes an eleventh within the
   window, **Then** it is refused with a rate-limited status.
3. **Given** one caller is being refused, **When** a different caller makes its first request,
   **Then** that request is served normally, with a full allowance of its own.
4. **Given** a request carrying a client identifier header, **When** a second request arrives from
   the same network address but a different identifier, **Then** the two are counted separately.
5. **Given** two requests with no client identifier header, **When** both arrive from the same
   network address, **Then** they are counted against the same allowance.

---

### User Story 2 - The window slides, it does not reset (Priority: P1)

A caller that was refused waits. Its allowance comes back gradually, one slot at a time as each
individual request ages out, not all at once on a clock boundary.

**Why this priority**: Also P1, and deliberately separated from User Story 1 because this is the
behaviour a plausible implementation gets wrong. A fixed sixty-second bucket satisfies every
scenario in User Story 1 and fails every scenario here.

**Independent Test**: Make ten requests at a known instant, advance time to just before the window
elapses, confirm still refused. Advance just past it and confirm exactly one request is allowed,
not ten.

**Acceptance Scenarios**:

1. **Given** ten requests made at time `t`, **When** an eleventh arrives at `t + 59999 ms`,
   **Then** it is refused.
2. **Given** ten requests made at time `t`, **When** a request arrives at `t + 60001 ms`, **Then**
   it is served, because exactly one slot has freed.
3. **Given** the situation above, **When** a further request arrives immediately after that one,
   **Then** it is refused, because only one slot freed, not the whole allowance.
4. **Given** ten requests spread across the window rather than made together, **When** time
   advances, **Then** slots free one at a time in the order the requests were made, each exactly
   60000 ms after its own moment.
5. **Given** a caller that is being refused, **When** it keeps trying throughout the window,
   **Then** those refusals do not push its recovery further out. Being blocked never extends the
   block.

---

### User Story 3 - A refused caller is told what to do (Priority: P2)

A client that is being refused, or approaching its limit, can read from the response alone how
much allowance remains, when it resets, and how long to wait before retrying.

**Why this priority**: The isolation in User Story 1 works whether or not anyone is told about it.
This is what turns a refusal into something a client can handle automatically instead of retrying
blindly.

**Independent Test**: Make a sequence of requests and read the reported remaining allowance
counting down. Exceed the limit and read the retry delay from the refusal.

**Acceptance Scenarios**:

1. **Given** a caller making its first request, **When** the response comes back, **Then** it
   reports the limit, the remaining allowance after this request, and when the allowance resets.
2. **Given** a caller making successive requests, **When** each response comes back, **Then** the
   remaining allowance counts down by one each time: nine, then eight, then seven.
3. **Given** a caller that has exhausted its allowance, **When** it is refused, **Then** the
   remaining allowance is reported as zero rather than a negative number.
4. **Given** a refusal, **When** the client reads the retry delay, **Then** it is a whole number of
   seconds and never below one, so a client that waits exactly that long is never refused for
   being too early by a fraction of a second.
5. **Given** any reset value in any response, **When** the client interprets it, **Then** it is in
   the same unit every time and that unit is seconds, not milliseconds.

---

### User Story 4 - Liveness checks are never refused (Priority: P2)

A monitor polling the health route is never rate limited, at any volume, and its responses carry
no rate-limit reporting at all.

**Why this priority**: A monitor that gets refused reports the service as down, which turns rate
limiting into the outage it was meant to prevent.

**Independent Test**: Poll the health route far more than the limit from a single key. Every
response succeeds, and none carries rate-limit headers.

**Acceptance Scenarios**:

1. **Given** a caller that has already exhausted its allowance on other routes, **When** it
   requests the health route, **Then** it is served normally.
2. **Given** any number of health requests from one key, **When** they are made, **Then** none is
   refused and none consumes allowance that other routes would have used.
3. **Given** a health response, **When** its headers are inspected, **Then** no rate-limit
   reporting is present at all.

---

### User Story 5 - Memory does not grow without bound (Priority: P3)

Callers that have gone quiet stop being tracked, so a service that has seen many distinct callers
over a long run does not accumulate a record for every one of them forever.

**Why this priority**: A correctness property with no visible symptom until it matters. Separated
so it can be asserted directly rather than inferred.

**Independent Test**: Track several keys, advance time past the window, make one further request
to drive the sweep, and read the tracked key count. It has dropped.

**Acceptance Scenarios**:

1. **Given** several keys that have each made requests, **When** time advances past the window for
   all of them and one further request arrives, **Then** the tracked key count falls to one: the
   key of that request, and nothing else.
2. **Given** one active key and several that have gone quiet, **When** time advances and the active
   key makes a further request, **Then** only the active key remains tracked.
3. **Given** any moment, **When** the tracked key count is read, **Then** it is observable without
   reaching into internal state, so the memory bound can be asserted by a test.
4. **Given** a long run of requests under continually changing keys, **When** the tracked key count
   is read at the end without anything having read it during the run, **Then** it reflects only the
   most recent window's keys, because the sweep runs during ordinary request handling rather than
   at the moment of observation.

---

### Edge Cases

- **A hit expiring exactly on the boundary**: a hit made at `t` stops counting at exactly
  `t + 60000 ms`, not one millisecond later. The rule is "counts while strictly less than 60000 ms
  old". The prompt pins only 59999 and 60001, which both readings of the boundary satisfy, so this
  bullet pins the instant between them. It is where an off-by-one lives and a spec that leaves it
  open has left the whole feature open.
- **An empty client identifier header**: treated as absent, so the network address is used. A
  header present but blank is not a distinct client.
- **Refusals while already blocked**: never recorded, never counted, never push the reset later. A
  caller hammering the door does not lengthen its own wait.
- **Retry delay when the next slot frees in under a second**: reported as one second, never zero
  and never a fraction, so a client that obeys it is never refused for being marginally early.
- **A key that has never been seen**: reports a full allowance minus the request being served.
  Nothing needs to be created in advance.
- **The reset value when a caller is not blocked**: still reported, and still the moment the oldest
  counted hit ages out.
- **Requests refused for other reasons** (an unknown route, an unreadable body): still counted
  against the allowance, because rate limiting runs before routing and the cost was already paid.
- **Two requests at the identical timestamp**: both counted. Nothing collapses hits that share a
  moment.
- **A key that is never seen again**: reclaimed by the periodic full sweep, not left in place
  waiting for a caller that never returns. The sweep is driven by the time supplied to ordinary
  request handling, so it happens in a live process with nothing observing it, and it still runs
  without waiting in a test.
- **Sweeping when no time has passed**: a full sweep runs at most once per window, so a burst of
  requests within one window triggers one sweep between them, not one per request.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The service MUST allow at most ten requests per key within any sixty-second window.
- **FR-002**: The service MUST derive the key from the client identifier header when it is present
  and non-empty, and from the caller's network address otherwise. The header MUST be taken at face
  value: the service MUST NOT additionally cap a caller by network address when a header is
  present. The network address MUST be the direct socket address of the connecting peer.
  Forwarding headers such as `X-Forwarded-For` MUST NOT be consulted.
- **FR-003**: Allowances MUST be independent per key. Activity on one key MUST NOT affect another.
- **FR-004**: The window MUST slide. Each recorded request MUST stop counting exactly 60000 ms
  after the moment it was made, and each MUST expire independently of the others.
- **FR-005**: At 59999 ms after a caller's tenth request, that caller MUST still be refused. At
  60001 ms, exactly one further request MUST be allowed, and no more.
- **FR-006**: A refused request MUST be answered with a rate-limited status and a body identifying
  the failure as `rate_limited`.
- **FR-007**: A refusal MUST carry a retry delay expressed in whole seconds, and that delay MUST
  never be reported as less than one.
- **FR-008**: A refused request MUST NOT be recorded against the allowance. Being refused MUST NOT
  delay the caller's recovery.
- **FR-009**: Every response on a non-exempt route, whether allowed or refused, MUST report the
  limit, the remaining allowance, and the moment the allowance next resets.
- **FR-010**: The reported reset MUST be expressed in unix seconds, never milliseconds, in every
  response without exception.
- **FR-011**: The reported remaining allowance MUST count down by one per allowed request and MUST
  be reported as zero, never negative, when the caller is refused.
- **FR-012**: The health route MUST never be refused, at any volume, and MUST NOT consume
  allowance.
- **FR-013**: Responses on the health route MUST carry no rate-limit reporting of any kind.
- **FR-014**: Keys whose recorded requests have all expired MUST stop being tracked. Reclamation
  MUST NOT depend on anything outside the limiter choosing to observe it: handling a request MUST
  expire that key's own hits, and MUST additionally sweep every tracked key at most once per
  window, so a process that only ever handles requests still stays bounded.
- **FR-015**: The number of currently tracked keys MUST be observable through the public interface,
  so a memory bound can be asserted by a test. That count MUST be a passive observation: it MUST
  NOT take the current time, and MUST NOT expire or sweep anything. It reports what is held at the
  moment it is asked, so a failure of FR-014 is visible rather than tidied away by the act of
  looking.
- **FR-016**: The limiting component MUST take the current time as an argument and MUST NOT read
  the clock itself.
- **FR-017**: The limiting component MUST take a key as text and MUST know nothing about HTTP,
  requests, headers, or routes.

### Key Entities

- **Key**: the text that identifies one caller for limiting purposes. Derived from a header or a
  network address, but the limiter neither knows nor cares which.
- **Hit**: one recorded request against a key, carrying the moment it happened. Expires on its own
  schedule, independent of every other hit.
- **Decision**: the answer to "may this request proceed", carrying whether it is allowed, the
  limit, the remaining allowance, the reset moment, and a retry delay when refused.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: One caller exceeding its allowance changes the outcome of zero requests made by any
  other caller.
- **SC-002**: A caller refused at the limit is served again exactly 60001 ms after its oldest
  counted request, and is refused at 59999 ms, in 100% of attempts.
- **SC-003**: Recovery is gradual: after the first slot frees, a caller gets exactly one request,
  not a fresh allowance of ten.
- **SC-004**: A client that waits exactly the reported retry delay is never refused for having
  waited too little, in 100% of attempts.
- **SC-005**: 100% of non-exempt responses report the allowance, and 0% of health responses do.
- **SC-006**: A caller that is refused repeatedly recovers at exactly the same moment as one that
  stopped trying, so refusals cost nothing.
- **SC-007**: After every tracked caller has been idle for the window, the next request leaves its
  own key tracked and nothing else, and this is verifiable from outside the component.
- **SC-009**: A process that serves a long run of requests under continually changing keys, and
  never once reads the tracked key count, still holds a number of keys bounded by the traffic of a
  single window, not by the traffic of the whole run. Because reading the count changes nothing,
  this is a genuine measurement rather than an artefact of looking.
- **SC-008**: Every behaviour above is verifiable without waiting in real time, so the full
  acceptance suite runs in milliseconds.

## Assumptions

- **Limit and window are fixed constants**: ten and sixty seconds, not configurable. Configuration
  is explicitly out of scope, so a value that can be changed is scope this feature did not ask for.
- **Rate limiting runs before routing**: so a refused caller cannot probe for valid routes for
  free, and an unknown path still costs a slot. This is why the edge case above counts them.
- **The health route is the only exemption**, matched by exact path, consistent with the exact path
  matching already specified in feature 001.
- **The reset moment is when the oldest counted hit expires**, which is the first instant the
  caller's allowance increases. Not the end of a calendar minute, which would be the fixed-bucket
  reading this spec exists to rule out.
- **Time is supplied to the limiter as milliseconds since the epoch**, matching the `now: number`
  convention the project already uses. Reported reset values are converted to seconds by rounding
  up, so a reset never reads as already past.
- **Network address means the socket address**: the address of the peer that opened the
  connection, never a forwarding header. Behind a shared proxy that means every header-less caller
  collapses onto one allowance. That is a deployment consequence, recorded here so it is not
  mistaken for a defect, and the supported way for such a caller to be counted separately is to
  send the client identifier header. `X-Forwarded-For` is exactly as forgeable as that header, so
  trusting it would add a second unverified input without adding a second guarantee.
- **Network address is available**: when it cannot be determined, a single shared fallback key is
  used. Callers behind that fallback share an allowance, which is the safe direction to fail.
- **The client identifier header is trusted**: it is caller-supplied and unverified, so a caller
  that sends a fresh `X-Client-Id` on every request receives a fresh allowance every time. This is
  accepted, not an oversight. The service is assumed to sit behind a trusted caller boundary,
  consistent with the single-process, no-configuration, no-allow-list scope of this feature.
  Treating the header as a hint rather than a credential is what keeps key derivation to one line;
  capping by address as well would mean two counters per request and no single answer to what the
  reported headers describe.

## Out of Scope

- Distributed or cross-process limiting. One process, one set of counters. Two instances mean two
  independent allowances.
- Per-endpoint, per-method, or per-plan limits. One limit for everything except health.
- Configuration, environment variables, or any runtime switch for the limit or the window.
- Persistence. Counters are lost on restart, and a restart grants everyone a fresh allowance.
- Allow-lists, deny-lists, or any per-caller exemption beyond the health route.
- Queueing, throttling, or delaying a request instead of refusing it.

## Allowed paths

The gate reads this fence. A diff touching anything outside it fails `npm run gate` before a human
reads a line.

```allow
src/rate-limit.ts
src/app.ts
specs/002-rate-limit/**
```

`tests/**` is deliberately absent. It is denied repo-wide by
[`constraints.md`](../../constraints.md), so acceptance tests for this feature are written by a
human before an agent is pointed at anything.

Repo-wide rules that always apply, whatever is listed here, are in
[`constraints.md`](../../constraints.md).
