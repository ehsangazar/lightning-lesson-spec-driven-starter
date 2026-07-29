# Feature Specification: Items API

**Feature Branch**: `001-items-api`

**Created**: 2026-07-28

**Status**: Draft

**Input**: User description: "A minimal HTTP JSON API with no framework, built on `node:http`. Three routes: `GET /health` returns `{ "ok": true }`; `POST /items` accepts `{ "name": string }` and returns the created item with a generated id; `GET /items` returns every item created so far. Storage is in-memory and resets when the process restarts. Unknown routes return 404 with `{ "error": "not_found" }`; malformed JSON returns 400 with `{ "error": "bad_request" }`. The request handler must be constructible without opening a socket, so tests can drive it directly. Not doing: authentication, persistence, pagination, updates or deletes."

## Clarifications

### Session 2026-07-28

- Q: When someone submits an item whose name is empty or nothing but spaces, should the
  service record it or reject it? → A: Reject empty or whitespace-only names as
  `bad_request`, and trim surrounding whitespace before storing the rest.
- Q: If something unexpected goes wrong while handling a request, should the service answer
  with a 500 and stay up, or let the failure take the process down? → A: Catch it at the
  socket layer, log it, answer 500 with a structured error body, and keep serving.
- Q: Should the number of items the service will hold be capped, or is it allowed to grow
  until the process restarts? → A: Uncapped, and stated plainly so nobody adds a limit later
  thinking it was implied.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record and retrieve items (Priority: P1)

A client sends a named item to the service and gets back that item with an identifier the
service assigned. Later, the client asks for everything recorded so far and receives the
full collection, including the item it just created.

**Why this priority**: This is the entire point of the service. Without it there is nothing
to call. Health and error handling are meaningful only once there is something to be
healthy about or to get wrong.

**Independent Test**: Create two items and read the collection back. The response contains
both items, each with the submitted name and a distinct identifier, in the order they were
created. No other route needs to exist for this to be testable.

**Acceptance Scenarios**:

1. **Given** a freshly started service with nothing recorded, **When** the client requests
   the collection, **Then** it receives an empty collection and a success status.
2. **Given** a freshly started service, **When** the client submits an item named `"widget"`,
   **Then** it receives a created-status response containing that name and an identifier the
   client did not supply.
3. **Given** an item was just created, **When** the client requests the collection, **Then**
   the response contains exactly that one item, with the same identifier returned at creation.
4. **Given** two items are submitted with the same name, **When** the client requests the
   collection, **Then** both appear, with different identifiers, in submission order.
5. **Given** several items have been recorded, **When** the service process restarts,
   **Then** a request for the collection returns an empty collection.

---

### User Story 2 - Confirm the service is alive (Priority: P2)

An operator or an automated monitor asks the service whether it is running, and gets an
unambiguous affirmative without touching or disturbing any recorded data.

**Why this priority**: Needed to deploy and monitor the service, but the service delivers no
value from this route alone. It is deliberately independent of stored state so that it stays
answerable even when the collection is empty.

**Independent Test**: Request the health route on a service with no items recorded. It
returns a success status and an affirmative body. Requesting it repeatedly changes nothing
about the collection.

**Acceptance Scenarios**:

1. **Given** a running service, **When** the client requests the health route, **Then** it
   receives a success status and a body indicating the service is healthy.
2. **Given** items have been recorded, **When** the client requests the health route,
   **Then** the response is identical to the empty-service case and the collection is
   unchanged afterwards.

---

### User Story 3 - Predictable responses to bad requests (Priority: P3)

A client that asks for something that does not exist, or sends a body the service cannot
read, gets a clear machine-readable rejection rather than a crash, a hang, or an empty
response. The service continues serving other clients normally.

**Why this priority**: It hardens what stories 1 and 2 already deliver. Valuable, but the
service is demonstrable without it.

**Independent Test**: Send a request to a route that does not exist and a creation request
whose body is not readable as structured data. Both return the documented status and error
body, and a subsequent valid request still succeeds.

**Acceptance Scenarios**:

1. **Given** a running service, **When** the client requests a route the service does not
   define, **Then** it receives a not-found status and a body identifying the failure as
   `not_found`.
2. **Given** a running service, **When** the client submits a creation request whose body is
   not readable as structured data, **Then** it receives a bad-request status and a body
   identifying the failure as `bad_request`.
3. **Given** a request has just been rejected, **When** the client sends a valid creation
   request, **Then** it succeeds normally and the rejected request left nothing behind in the
   collection.
4. **Given** storage that has been rigged to fail, **When** the client sends an otherwise
   valid creation request, **Then** it receives a server-error status and an `internal_error`
   body rather than a hang or a dropped connection.
5. **Given** a request has just failed unexpectedly, **When** the client sends a valid
   request, **Then** the service answers it normally, proving the earlier failure did not end
   the process.

---

### Edge Cases

- **Empty collection**: reading the collection before anything is created returns an empty
  collection with a success status, not a not-found.
- **Body is readable but the name is missing or not text**: rejected as `bad_request`. The
  item is not recorded.
- **Name is empty or entirely whitespace**: rejected as `bad_request`, for the same reason.
  Whitespace is not a name.
- **Name has leading or trailing whitespace around real text**: accepted. The whitespace is
  trimmed and the trimmed form is what is recorded and returned, so `"  spaced  "` and
  `"spaced"` produce identical items with different identifiers.
- **Body is empty on a creation request**: rejected as `bad_request`.
- **Extra fields in a creation body**: ignored. The recorded item carries only the name and
  the assigned identifier.
- **Client supplies its own identifier in the creation body**: ignored. The service always
  assigns the identifier.
- **A defined path used with an undefined action** (for example, a delete against the
  collection): rejected as `not_found`, the same as any undefined route.
- **Duplicate names**: permitted. Names are not identifiers and are not checked for
  uniqueness.
- **Trailing slash or differing case in the path**: treated as an undefined route and
  rejected as `not_found`. Paths match exactly.
- **A rejected request must not consume an identifier or otherwise change observable state.**
- **Handling a request fails unexpectedly**: the caller gets a server-error status and an
  `internal_error` body, the failure is recorded for an operator, and the next request is
  served normally. One caller's bad luck does not take the service down for everyone.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The service MUST expose a health route that returns a success status and a body
  stating the service is healthy.
- **FR-002**: The service MUST accept a creation request carrying a name and record an item
  with that name.
- **FR-003**: The service MUST assign every recorded item an identifier that is unique among
  all items recorded since the process started. The client MUST NOT be able to choose it.
- **FR-004**: The service MUST return the newly recorded item, including its identifier, in
  the response to a successful creation request, with a created status.
- **FR-005**: The service MUST return every item recorded since the process started when the
  collection is requested, in creation order.
- **FR-006**: The service MUST return an empty collection, with a success status, when
  nothing has been recorded.
- **FR-007**: The service MUST hold recorded items only for the lifetime of the process.
  After a restart, no previously recorded item is retrievable.
- **FR-007a**: The collection MUST NOT be capped. The service MUST NOT reject a creation
  request on the grounds that it already holds many items, and MUST NOT discard a previously
  recorded item to make room for a new one.
- **FR-008**: The service MUST reject any request that does not match a defined route with a
  not-found status and a body identifying the failure as `not_found`.
- **FR-009**: The service MUST reject a creation request whose body cannot be read as
  structured data, or which lacks a usable name, with a bad-request status and a body
  identifying the failure as `bad_request`. A name is usable when it is text that contains at
  least one non-whitespace character.
- **FR-009a**: The service MUST remove leading and trailing whitespace from a usable name
  before recording it. The recorded name is what every later read returns.
- **FR-010**: The service MUST leave the recorded collection unchanged when it rejects a
  request for any reason.
- **FR-011**: Every response the service produces, successful or not, MUST have a structured
  body that a client can parse with the same reader it uses for successful responses.
- **FR-012**: The service MUST continue serving subsequent requests normally after rejecting
  any request.
- **FR-013**: The component that handles requests MUST be constructible and drivable without
  binding a network port, so that the behaviour in FR-001 to FR-012 can be exercised end to
  end in a test without networking.
- **FR-014**: The health route MUST be answerable regardless of what has been recorded, and
  answering it MUST NOT change the collection.
- **FR-015**: When handling a request fails for a reason the service does not anticipate, the
  service MUST answer with a server-error status and a body identifying the failure as
  `internal_error`, MUST record the failure where an operator can find it, and MUST remain
  able to serve the next request. The process MUST NOT end because one request failed.

### Key Entities

- **Item**: something the client asked the service to remember. Has a name supplied by the
  client and an identifier assigned by the service. Nothing else. Items have no relationships
  to one another beyond the order in which they were created.
- **Collection**: every item recorded since the process started, in creation order. Bounded
  only by the lifetime of the process, never by a maximum item count.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An item submitted successfully appears in the very next read of the collection,
  in 100% of attempts within a single process lifetime.
- **SC-002**: 100% of responses, including every rejection, carry a body that parses with the
  same structured-data reader, so a client needs no special case for failure.
- **SC-003**: A client can distinguish "you asked for something that does not exist" from
  "what you sent could not be read" from the response alone, without consulting logs.
- **SC-004**: After any sequence of rejected requests, a following valid request succeeds, in
  100% of attempts, and no rejected request leaves an item behind.
- **SC-005**: Every behaviour in this specification can be verified without opening a network
  port, so the full acceptance suite runs with no networking.
- **SC-006**: Following a restart, 0 previously recorded items are retrievable.
- **SC-007**: A newcomer can read the complete route contract, all three routes and both
  failure modes, in under five minutes.

## Assumptions

Reasonable defaults chosen where the description did not specify. Each is cheap to change if
wrong, and each is asserted by an acceptance test so a change is visible.

- **Created status**: a successful creation returns `201`, the conventional status for a
  resource that did not exist before. Reads return `200`.
- **Identifier form**: an opaque string, unique within one process lifetime. Clients MUST
  treat it as opaque. It is not required to be globally unique, sortable, or meaningful, since
  storage does not survive a restart.
- **Ordering**: the collection is returned in creation order. The description says "every item
  created so far" without specifying order, and creation order is the only ordering the
  service can offer without a sort key.
- **Missing, non-text, or blank name**: treated as `bad_request`, the same as an unreadable
  body. All are the client sending something the service cannot act on, and distinguishing
  them would add error codes the description does not define. Resolved in Clarifications,
  session 2026-07-28.
- **Name length**: uncapped. A cap is a policy decision with no obvious right value, and
  nothing in scope reads the name back into a fixed-width context.
- **Undefined action on a defined path**: treated as `not_found`, not `405`. The description
  defines exactly three routes and one rejection for everything else; adding `405` would be
  scope the description did not ask for.
- **Path matching is exact**: no trailing-slash tolerance, no case folding, no normalisation.
- **Response shape for the collection**: a list of items, not wrapped in an envelope, since
  pagination is explicitly out of scope and an envelope exists to carry paging metadata.
- **Concurrency**: a single process serving requests one at a time. No ordering guarantee is
  offered for requests genuinely in flight simultaneously.
- **Unexpected-failure status and code**: `500` with `{"error": "internal_error"}`, following
  the naming of the two failures the description does define. This is a third error code, but
  it names a different class of problem: `not_found` and `bad_request` are the caller's fault,
  `internal_error` is the service's. Resolved in Clarifications, session 2026-07-28.
- **Request size**: no limit is imposed. In-memory storage and the absence of authentication
  mean this service is not intended to face untrusted traffic.
- **Collection size**: uncapped, so memory grows with the number of items recorded until the
  process restarts. Accepted for the same reason as request size: nothing here is built for
  untrusted traffic, and rate limiting is out of scope. Resolved in Clarifications, session
  2026-07-28.

## Out of Scope

Explicitly not being built. Each of these is a plausible next thing to want, and each is
excluded so that a diff containing it is visibly out of scope rather than arguably helpful.

- Authentication and authorisation. Every caller is treated identically.
- Persistence of any kind. Data loss on restart is the specified behaviour, not a defect.
- Pagination, filtering, sorting, or search over the collection.
- Updating or deleting an item. Items are write-once for the life of the process.
- Retrieving a single item by its identifier.
- Rate limiting, quotas, or any per-client behaviour.
- Configuration or environment-driven behaviour switches.

## Allowed paths

The gate reads this fence. A diff touching anything outside it fails `npm run gate` before a human
reads a line.

```allow
src/store.ts
src/app.ts
src/server.ts
specs/001-items-api/**
```

`tests/**` is deliberately absent. It is denied repo-wide by
[`constraints.md`](../../constraints.md), which is why FR-015's acceptance tests are a maintainer's
job and why this feature is still unfinished. That is the fence working, not a gap in it.

Repo-wide rules that always apply, whatever is listed here, are in
[`constraints.md`](../../constraints.md).
