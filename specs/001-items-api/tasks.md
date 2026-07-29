---

description: "Task list for Items API"
---

# Tasks: Items API

**Input**: Design documents from `/specs/001-items-api/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/http-api.md](./contracts/http-api.md)

**Tests**: Tests are MANDATORY (Constitution III). The spec also requires them directly:
FR-013 says the handler must be drivable without a socket, and SC-005 says every behaviour must
be verifiable without opening a port.

**Organization**: Tasks are grouped by user story so each can be implemented and tested
independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- **[FENCED]**: Touches `tests/api.test.ts`, which Principle V puts out of an agent's reach.
  These are authored by a maintainer. See the plan's Complexity Tracking for why.
- `- [x]` marks work already present in `src/` and verified green, not work done by this
  command. It is recorded so nobody rebuilds it.

## Read this before starting

Most of this feature already exists. `npm test` passes 11 tests and the `quickstart.md` curl
block passes end to end, so FR-001 through FR-014 are satisfied today.

The outstanding work is small and concentrated:

- **FR-015** (unexpected failure becomes a `500`) is specified but not implemented. Research
  [R3](./research.md) verified that an unhandled throw currently ends the process.
- **Seven acceptance scenarios** in the spec have no test asserting them. Five are behaviours
  the code already has, so those tests should pass on first run. Two cover FR-015 and will fail
  until it is built.
- **One Principle I cleanup**, the `as` cast at `src/app.ts:48`.

Every one of those test tasks is fenced.

---

## Phase 1: Setup

**Purpose**: Project initialization and basic structure

- [x] T001 Create project structure `src/` and `tests/` per [plan.md](./plan.md)
- [x] T002 Initialize the TypeScript project with zero runtime dependencies in `package.json`
      and `tsconfig.json` (Constitution I)
- [x] T003 [P] Configure Vitest to collect `tests/**/*.test.ts` in `vitest.config.ts`
- [ ] T004 Correct `engines.node` from `>=20` to `>=22.6` in `package.json` (research
      [R2](./research.md)). Node 20 lacks `--experimental-strip-types`, so `npm start` cannot
      work there while `npm test` still passes, which is why this has gone unnoticed

> **Fence**: tasks MUST NOT edit the test suite, the lockfile, TypeScript or test
> configuration, CI workflows, or the constitution (Constitution V). Tasks that need one of
> those are marked **[FENCED]** and belong to a maintainer.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The three-file layering every user story depends on

- [x] T005 Define `Item` and `Store` and implement `createStore` with counter-based identifiers
      in `src/store.ts`. No clock read, per Constitution II and
      [data-model.md](./data-model.md)
- [x] T006 Define `AppRequest`, `AppResponse`, `AppOptions` and implement `createApp` taking its
      store as an injected option in `src/app.ts`
- [x] T007 Implement the socket, environment and body-reading layer in `src/server.ts`, the only
      file permitted to touch any of them (Constitution II)

**Checkpoint**: Foundation ready, user story implementation can proceed

---

## Phase 3: User Story 1 - Record and retrieve items (Priority: P1) MVP

**Goal**: A client records a named item, gets back an assigned identifier, and can read the
whole collection in creation order.

**Independent Test**: Create two items and read the collection. Both appear, with distinct
identifiers, in submission order. No other route needs to exist.

### Tests for User Story 1 (MANDATORY)

- [x] T008 [P] [US1] Acceptance test for an empty collection on a fresh service in
      `tests/api.test.ts` (FR-006)
- [x] T009 [P] [US1] Acceptance test for creating an item and receiving a bare item with an
      assigned id in `tests/api.test.ts` (FR-002, FR-003, FR-004)
- [x] T010 [P] [US1] Acceptance test for listing in creation order in `tests/api.test.ts`
      (FR-005)
- [x] T011 [P] [US1] Acceptance test for trimming surrounding whitespace from a name in
      `tests/api.test.ts` (FR-009a)
- [ ] T012 [P] [US1] **[FENCED]** Acceptance test that two items submitted with the same name
      both appear with different identifiers, in submission order, in `tests/api.test.ts`
      (spec US1 scenario 4). No test asserts this today
- [ ] T013 [P] [US1] **[FENCED]** Acceptance test that a fresh `createStore()` yields an empty
      collection, standing in for a restart, in `tests/api.test.ts` (FR-007, spec US1 scenario
      5). Assert against a new store, never by restarting a process
- [ ] T014 [P] [US1] **[FENCED]** Acceptance test that recording many items neither rejects a
      creation nor discards an earlier item, in `tests/api.test.ts` (FR-007a)

### Implementation for User Story 1

- [x] T015 [US1] Implement `list()` and `create(name)` in `src/store.ts`
- [x] T016 [US1] Implement `POST /items` and `GET /items` routing in `src/app.ts` per
      [contracts/http-api.md](./contracts/http-api.md)
- [x] T017 [US1] Replace the `as` cast at `src/app.ts:48` with a narrowing predicate that checks
      `typeof body === 'object' && body !== null && 'name' in body` and returns
      `string | undefined`, in `src/app.ts` (Constitution I, research [R5](./research.md)).
      Done: `readName` in `src/app.ts`. `src/` and `tests/` now contain no `as`, no `any`, and
      no `@ts-expect-error`

**Checkpoint**: User Story 1 fully functional and independently testable

---

## Phase 4: User Story 2 - Confirm the service is alive (Priority: P2)

**Goal**: An operator or monitor gets an unambiguous affirmative without disturbing stored data.

**Independent Test**: Request `/health` on a service with nothing recorded. Success status,
affirmative body, collection untouched afterwards.

### Tests for User Story 2 (MANDATORY)

- [x] T018 [P] [US2] Acceptance test for `GET /health` returning `{"ok": true}` in
      `tests/api.test.ts` (FR-001)
- [ ] T019 [P] [US2] **[FENCED]** Acceptance test that `/health` answers identically once items
      exist and leaves the collection unchanged, in `tests/api.test.ts` (FR-014, spec US2
      scenario 2)

### Implementation for User Story 2

- [x] T020 [US2] Implement `GET /health` in `src/app.ts`, exempt from any stored-data lookup

**Checkpoint**: User Stories 1 and 2 both work independently

---

## Phase 5: User Story 3 - Predictable responses to bad requests (Priority: P3)

**Goal**: A bad request gets a clear machine-readable rejection, never a crash, hang, or empty
response, and the service keeps serving everyone else.

**Independent Test**: Send an undefined route and an unreadable body. Both return the documented
status and error body, and a following valid request still succeeds.

### Tests for User Story 3 (MANDATORY)

- [x] T021 [P] [US3] Acceptance tests for the four invalid-create cases returning `400`
      `bad_request` in `tests/api.test.ts` (FR-009)
- [x] T022 [P] [US3] Acceptance test for an undefined path returning `404` `not_found` in
      `tests/api.test.ts` (FR-008)
- [ ] T023 [P] [US3] **[FENCED]** Acceptance test that a defined path with an undefined method
      (`DELETE /items`) returns `404`, not `405`, in `tests/api.test.ts` (FR-008). Verified by
      curl only today
- [ ] T024 [P] [US3] **[FENCED]** Acceptance test that path matching is exact, so `/health/`
      returns `404`, in `tests/api.test.ts` (FR-008)
- [ ] T025 [P] [US3] **[FENCED]** Acceptance test that a rejected request leaves the collection
      unchanged and consumes no identifier, in `tests/api.test.ts` (FR-010, spec US3 scenario 3)
- [ ] T026 [P] [US3] **[FENCED]** Acceptance test that a store whose `create` throws produces
      `500` with `{"error": "internal_error"}`, in `tests/api.test.ts` (FR-015, spec US3
      scenario 4). Will fail until T028 lands
- [ ] T027 [P] [US3] **[FENCED]** Acceptance test that the handler serves the next request
      normally after an unexpected failure, in `tests/api.test.ts` (FR-015, spec US3 scenario 5)

### Implementation for User Story 3

- [x] T028 [US3] Return `400` `bad_request` for a body that will not parse as JSON, in
      `src/server.ts` (FR-009)
- [x] T029 [US3] Return `404` `not_found` for anything matching no route, in `src/app.ts`
      (FR-008)
- [ ] T030 [US3] Wrap routing in `src/app.ts` so a thrown error becomes `500` with
      `{"error": "internal_error"}` rather than propagating (FR-015). This belongs in `app.ts`
      rather than `server.ts` so it has a test seam, per research [R4](./research.md)
- [ ] T031 [US3] Add an optional `onError?: (error: unknown) => void` to `AppOptions` in
      `src/app.ts` and call it when T030 catches. Keeps `app.ts` free of I/O while still
      satisfying FR-015's "record the failure where an operator can find it"
- [ ] T032 [US3] Pass a logging `onError` from `src/server.ts` into `createApp`, and add an
      outer `try`/`catch` around the `end` listener for failures that happen before the handler
      is reached (FR-015). Research [R3](./research.md) verified that without this the process
      exits and the caller sees a dropped socket

**Checkpoint**: All user stories independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T033 Run `npm run typecheck` and confirm `tsc --noEmit` is clean, the only thing enforcing
      Constitution I since nothing compiles at run time. Clean
- [x] T034 Run `npm test` and confirm every acceptance test passes, including the previously
      fenced additions. 11/11 pass. Note the fenced additions are not among them: T012 to T014,
      T019, T023 to T027 were never written, so this is the pre-existing suite only
- [x] T035 Walk the curl block in [quickstart.md](./quickstart.md) against a running service and
      confirm each response matches exactly. All 11 lines match

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies. T004 is independent of everything else
- **Foundational (Phase 2)**: already complete, blocks nothing further
- **User Stories (Phases 3 to 5)**: all independent of one another and can proceed in parallel
- **Polish (Phase 6)**: depends on every preceding phase

### Within User Story 3

T026 and T027 assert behaviour that T030 to T032 build, so they will fail when first written.
That is intended: Constitution III says tests are watched to fail before the implementation
lands. T031 must precede T032, since T032 passes the callback T031 defines.

### The fence, and what it means for ordering

Nine tasks are marked **[FENCED]**: T012, T013, T014, T019, T023, T024, T025, T026, T027. All
nine touch `tests/api.test.ts`, and T004 touches `package.json`.

An agent cannot write them. That is not a scheduling detail, it is the gate that stops this
plan: T030 to T032 implement FR-015, and under Constitution III they may not land without T026
and T027 in place first. So the ordering is:

1. A maintainer writes T026 and T027, and watches them fail
2. An agent implements T030, T031, T032 against them
3. The remaining fenced tests (T012, T013, T014, T019, T023, T024, T025) can be written at any
   point, and should pass immediately since they cover behaviour the code already has

### Parallel Opportunities

- All of Phase 1 and Phase 2 is complete, so nothing there competes
- The three user stories touch different routes and can be worked independently
- Every task marked `[P]` within a story is a separate test case and can be written alongside
  its siblings
- T017 (`as` cast) and T004 (`engines`) touch different files from everything else and can land
  at any time

## Parallel Example: the fenced tests that should pass on arrival

```bash
# All cover existing behaviour, so all should go green immediately:
Task: "T012 duplicate names get distinct ids in tests/api.test.ts"
Task: "T013 fresh store is empty in tests/api.test.ts"
Task: "T014 collection is uncapped in tests/api.test.ts"
Task: "T019 health unaffected by stored items in tests/api.test.ts"
Task: "T023 DELETE /items returns 404 in tests/api.test.ts"
Task: "T024 /health/ returns 404 in tests/api.test.ts"
Task: "T025 a rejection changes nothing in tests/api.test.ts"
```

## Implementation Strategy

### What is already delivered

User Stories 1, 2 and 3 all function today apart from FR-015. The MVP is not ahead of you, it
is behind you. What remains is closing the gap between what the code does and what the spec now
says, which clarification widened by one requirement.

### Recommended order

1. **T026, T027** by a maintainer. Watch them fail
2. **T030, T031, T032** to make them pass. This is the only real implementation work left
3. **T017** and **T004**, both one-liners, independent of the above
4. **T012, T013, T014, T019, T023, T024, T025** to close the coverage gap on behaviour that
   already works
5. **T033, T034, T035** to confirm

### Notes

- `- [x]` means verified present and green, not completed by this command
- Nine tasks are fenced and belong to a maintainer
- Only T030 to T032 change what the service actually does. Everything else is coverage,
  compliance, or documentation accuracy
