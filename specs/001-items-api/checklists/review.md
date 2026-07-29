# Review Checklist: Items API

**Purpose**: What a human confirms once `npm run gate` is green. The gate proves the code does what
the spec says; this asks whether the spec was right.
**Created**: 2026-07-29
**Feature**: [spec.md](../spec.md)

Companion to [requirements.md](./requirements.md), which checks the quality of the specification.
This one checks the change.

## Contract

- [ ] `GET /health` returns `{"ok": true}`, not `{"status": "ok"}`
- [ ] `GET /items` returns a bare list, not an envelope, and `[]` when nothing is recorded
- [ ] `POST /items` returns the bare item with a service-assigned id, at `201`
- [ ] Every failure body uses `bad_request`, `not_found`, or `internal_error`, and no fourth code
      has crept in
- [ ] A client-supplied `id` in a creation body is ignored

## Boundaries

- [ ] `DELETE /items` is `404`, not `405`
- [ ] `/health/` with a trailing slash is `404`. Path matching is exact
- [ ] A whitespace-only name is `bad_request`, and a name with surrounding whitespace is trimmed
      and accepted
- [ ] A rejected request records nothing and consumes no identifier

## FR-015, the requirement clarification added

- [ ] A store rigged to throw produces `500` with `{"error": "internal_error"}`, not a dropped
      connection
- [ ] The process survives, and the next request is served normally
- [ ] The failure reaches somewhere an operator would actually look
- [ ] `src/app.ts` performs no I/O of its own to achieve this

## Constitution

- [ ] `src/store.ts` and `src/app.ts` contain no `Date.now()`, no `process.env`, no `node:http`
- [ ] Identifiers come from a counter, not a timestamp
- [ ] No `as`, no `any`, no `@ts-expect-error` anywhere in the diff
- [ ] Every new behaviour arrived with a test that failed before it

## Scope

- [ ] The diff touches only paths in the `allow` fence
- [ ] Nothing added persistence, pagination, auth, or single-item retrieval

## The questions the gate cannot ask

- [ ] Is an uncapped in-memory collection genuinely acceptable, or did it survive review because
      it was written down as an assumption?
- [ ] `package.json` still says Node 20 while the service needs 22.6. Has that been fixed, or
      merely noted again?
