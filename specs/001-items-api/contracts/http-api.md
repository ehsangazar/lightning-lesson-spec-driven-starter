# HTTP Contract: Items API

**Feature**: [spec.md](../spec.md) | **Date**: 2026-07-28

Three routes. Every response carries `content-type: application/json` and a body that parses
as JSON, including every failure (FR-011, SC-002).

Path matching is exact: no trailing-slash tolerance, no case folding, no normalisation. A
defined path used with an undefined method is not a `405`, it is a `404` (Assumptions).

---

## `GET /health`

Liveness. Never touches or reports on stored data (FR-014).

**Response** `200`

```json
{ "ok": true }
```

Identical whether the collection is empty or full. Answering it changes nothing.

---

## `POST /items`

Record a new item.

**Request**

```json
{ "name": "widget" }
```

`name` is required and must be text containing at least one non-whitespace character. Any other
member of the body is ignored, including a client-supplied `id`.

**Response** `201`

```json
{ "id": "1", "name": "widget" }
```

The created item, bare, not wrapped. `id` is assigned by the service and is opaque.

Leading and trailing whitespace is trimmed before storing, so `{"name": "  widget  "}` records
and returns `widget` (FR-009a).

**Response** `400`

```json
{ "error": "bad_request" }
```

Returned when the body is unreadable as JSON, is not an object, lacks `name`, has a non-text
`name`, or has a `name` that is empty or entirely whitespace. Nothing is recorded, and no
identifier is consumed (FR-010).

---

## `GET /items`

Every item recorded since the process started, in creation order.

**Response** `200`

```json
[
  { "id": "1", "name": "widget" },
  { "id": "2", "name": "widget" }
]
```

A bare list, not an envelope. An empty collection is `[]` with `200`, never a `404` (FR-006).
Duplicate names are permitted and appear as distinct items with distinct identifiers.

The list is uncapped and never truncated (FR-007a). It empties on restart (FR-007).

---

## Anything else

**Response** `404`

```json
{ "error": "not_found" }
```

Covers an undefined path (`/nope`), a defined path with an undefined method (`DELETE /items`),
and a path that differs only by trailing slash or case (`/health/`, `/Health`).

---

## Unexpected failure

**Response** `500`

```json
{ "error": "internal_error" }
```

Returned when handling a request fails for a reason the service does not anticipate (FR-015).
The failure is recorded where an operator can find it, and the process keeps serving. A caller
never sees a dropped connection or a hang in place of this.

This is the only error code that reports the service's fault rather than the caller's, which is
why it is named separately from `bad_request` and `not_found`.

---

## Summary

| Method | Path | Success | Failure modes |
|---|---|---|---|
| `GET` | `/health` | `200` `{"ok":true}` | `500` |
| `POST` | `/items` | `201` bare item | `400` `bad_request`, `500` |
| `GET` | `/items` | `200` bare list | `500` |
| any | anything else | n/a | `404` `not_found` |

**Not in this contract**, and deliberately: authentication, pagination, filtering, sorting,
single-item retrieval by id, update, delete, rate limiting, and any configuration surface.
