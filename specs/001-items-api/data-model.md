# Phase 1 Data Model: Items API

**Feature**: [spec.md](./spec.md) | **Date**: 2026-07-28

Two entities and one internal type. Nothing persists, so there are no migrations, no schema
versioning, and no indexes.

---

## Item

The only thing the service stores. Created once, never updated, never deleted (Out of Scope).

| Field | Type | Source | Rules |
|---|---|---|---|
| `id` | `string` | assigned by the service | Unique among items recorded since the process started. Opaque to clients. Never accepted from a client, even if one is supplied in the request body |
| `name` | `string` | supplied by the client | Required. At least one non-whitespace character. Leading and trailing whitespace removed before storing (FR-009a). Not unique, duplicates are permitted |

**Identity**: `id` alone. Two items with the same `name` are different items.

**Validation** (FR-009, FR-009a). A creation body fails validation when any of these hold:

- the body is absent, or was not readable as structured data
- the body is not an object, or has no `name` member
- `name` is not text
- `name` is text but contains no non-whitespace character

Every failure produces the same result: `400` with `{"error": "bad_request"}`, and nothing is
recorded. The spec deliberately does not distinguish between them (Assumptions), so validation
is a single predicate rather than a chain of typed errors.

**Lifecycle**: one state. Created, then readable until the process ends. There are no
transitions to model because nothing in scope mutates or removes an item.

---

## Collection

Every `Item` recorded since the process started, in creation order.

| Property | Value |
|---|---|
| Ordering | Creation order, always. Not sorted, not configurable |
| Bound | None (FR-007a). Never capped, never evicted |
| Lifetime | The process. A restart empties it (FR-007) |
| Initial state | Empty (FR-006). No seed data |

**Relationships**: none. Items do not reference one another. Position in the collection is the
only relation, and it is implied by insertion rather than stored on the item.

**Read shape**: a bare list of items, not an envelope (Assumptions). `GET /items` on an empty
collection returns `[]` with `200`, not a `404`.

---

## Identifier generation

**Rule**: a counter, rendered as a decimal string, starting at `1` and incrementing per
recorded item.

**Why not a timestamp or a random value**: Principle II forbids anything below the server layer
from reading the clock, and identifier assignment lives in `src/store.ts`. A counter needs no
clock, no `now: number` parameter threaded through the store, and no entropy source. Since
storage does not survive a restart, the identifier never has to be unique beyond one process,
which is the only property a timestamp or UUID would have bought.

**Consequence to be aware of**: identifiers restart at `1` after a restart, so an identifier
from a previous run may name a different item in the next. This is consistent with FR-007,
which says nothing survives a restart, and clients are told to treat identifiers as opaque.

---

## Internal types

Not entities, but the shapes the layering depends on. Named here so `tasks.md` and the contract
agree on them.

| Type | File | Role |
|---|---|---|
| `Item` | `src/store.ts` | The record above |
| `Store` | `src/store.ts` | `list()` and `create(name)`. The injection seam that makes FR-015 testable (research R4) |
| `AppRequest` | `src/app.ts` | Method, path, headers, optional body, `ip`, `now`. Transport-shaped but socket-free, which is what lets tests drive the handler |
| `AppResponse` | `src/app.ts` | Status, headers, body. Returned, never written to a socket |
| `AppOptions` | `src/app.ts` | Injected dependencies. Currently `store` only |

`ip` and `now` on `AppRequest` are unused by this feature. They are carried so a per-client,
time-windowed policy can be added later without reshaping the request type. `now` is the
parameter Principle II requires for any future time-dependent behaviour, which is why it is a
plain number rather than a clock the handler could call.
