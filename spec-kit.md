# Building this repo with spec-kit

[github/spec-kit](https://github.com/github/spec-kit) is GitHub's toolkit for
the same idea this repo demonstrates: *define what to build before building it,
with any AI coding agent*. It ships a CLI and a set of slash commands that
generate the spec, the plan, and the task list for you.

This file is the honest comparison. It records what you would type, from an
empty directory, to arrive at something like this repository using spec-kit
instead of the four hand-written files here. Then it says where the two overlap,
and where each one leaves a hole the other fills.

Nothing here is required to use this repo. Read it if you are deciding between
the two, or if you already use spec-kit and want the gate.

---

## The one-line difference

spec-kit generates the spec. This repo enforces it.

spec-kit's output is documents an agent is asked to follow. This repo's
`constraints.md` deny fence and `scripts/gate.mjs` are a check that fails the
build when it does not. Those are different jobs, and you can have both.

---

## From scratch, step by step

### 0. Bootstrap

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@vX.Y.Z
specify init spec-driven-starter --integration claude
cd spec-driven-starter
```

Pin the version tag; the command surface moves. `--integration` takes your agent
(`claude`, `copilot`, `gemini`, `cursor`, and others). This writes
`.specify/` and the slash commands into your agent's command directory, for
example `.claude/commands/`.

Everything below is typed in the agent, not the shell.

### 1. `/speckit.constitution`

The constitution is spec-kit's equivalent of [`constraints.md`](./constraints.md):
project-wide rules that hold for every feature. Prompt:

> Node 20+ and TypeScript only. No new runtime dependencies, ever; Node's
> standard library is the whole toolbox. `strict` stays on: no `any`, no `as` to
> silence an error, no `@ts-expect-error` without a comment saying what removes
> it. Public functions get explicit parameter and return types.
>
> Business logic is pure functions. Exactly one file may own sockets,
> environment, or the clock. Anything time-dependent takes `now: number` as a
> parameter; nothing below the server layer calls `Date.now()`. One exported
> concern per file.
>
> Tests assert on behaviour through the public interface, never on internals. No
> sleeps, no real timers, no network: inject the clock. Order-dependent tests are
> broken tests. New behaviour lands with its acceptance tests.
>
> Fail loud on programmer error: throw `RangeError` or `TypeError` for invalid
> arguments. Never swallow an error to keep a test green. Comment the decision,
> not the mechanism. No emoji in source, commits, or logs.
>
> An agent may never modify the test suite, the lockfile, the TypeScript or test
> configuration, CI workflows, or this constitution. If a change genuinely needs
> one of those, stop and say so.

Writes `.specify/memory/constitution.md`.

That last paragraph is the important one, and it is also where the seam shows.
In spec-kit it is a rule stated to a model. In this repo it is the `deny` fence
that `npm run gate` reads, and the build fails on it whether the model agreed or
not.

### 2. `/speckit.specify` (feature 001: the service)

This repo starts with a small API already in place and adds rate limiting to it.
From scratch, that is two features. The first:

> A minimal HTTP JSON API with no framework, built on `node:http`. Three routes:
> `GET /health` returns `{ "ok": true }`; `POST /items` accepts
> `{ "name": string }` and returns the created item with a generated id;
> `GET /items` returns every item created so far. Storage is in-memory and
> resets when the process restarts. Unknown routes return 404 with
> `{ "error": "not_found" }`, malformed JSON returns 400 with
> `{ "error": "bad_request" }`.
>
> The request handler must be constructible without opening a socket, so tests
> can drive it directly. Not doing: authentication, persistence, pagination,
> updates or deletes.

Writes `specs/001-*/spec.md` and records the active feature in
`.specify/feature.json`.

### 3. `/speckit.clarify`

Optional, and worth it. spec-kit interviews you about the ambiguities it found
and folds the answers back into `spec.md`. It is the mechanised version of the
moment in this repo's README where writing section 2 of `SPEC.md` turns out to
be hard, and that difficulty is the finding.

### 4. `/speckit.plan`

> TypeScript with Node's built-in type stripping, no build step. Vitest for
> tests. Zero runtime dependencies. `src/store.ts` owns item storage as pure
> functions, `src/app.ts` builds the request handler and takes its dependencies
> as options, `src/server.ts` is the only file that touches sockets or the
> environment. Regression tests live in `tests/`.

Writes `plan.md` beside the spec, plus whatever supporting artifacts the plan
template calls for (research notes, data model, contracts).

### 5. `/speckit.tasks`, then `/speckit.implement`

`tasks.md` is the ordered breakdown; `implement` executes it. `/speckit.analyze`
between them cross-checks spec, plan, and tasks for drift, and
`/speckit.checklist` generates review checklists, which is section 6 of this
repo's `SPEC.md` template.

### 6. `/speckit.specify` (feature 002: rate limiting)

The interesting one, and the direct comparison with
[`spec/001-rate-limit/SPEC.md`](./spec/001-rate-limit/SPEC.md):

> Add per-client rate limiting so one noisy caller degrades only itself. Ten
> requests per sixty seconds per key. The key is the `X-Client-Id` header when
> present, otherwise the remote IP; distinct keys never affect each other.
>
> The window is sliding, not a fixed calendar bucket: each hit stops counting
> exactly 60000 ms after it happened, and each expires independently. At
> t = 59999 ms a blocked caller is still blocked; at t = 60001 ms exactly one
> slot has freed, not all ten.
>
> Over the limit responds 429 with `{ "error": "rate_limited" }` and a
> `Retry-After` header in whole seconds, never below 1. Every non-exempt
> response, allowed or rejected, carries `X-RateLimit-Limit`,
> `X-RateLimit-Remaining`, and `X-RateLimit-Reset`, where Reset is unix
> **seconds**, not milliseconds. Remaining counts down 9, 8, 7 and pins at 0
> when blocked. Rejected requests do not consume a slot: being blocked must not
> extend the block.
>
> `/health` is never limited at any volume and carries no rate-limit headers.
> Keys whose hits have all expired are dropped, and the tracked key count is
> observable so the memory bound can be asserted.
>
> The limiter takes the current time as an argument and never reads the clock
> itself. It knows nothing about HTTP: it takes a string key, not a request.
>
> Not doing: distributed or cross-process limiting, per-endpoint or per-plan
> limits, configuration or env vars, persistence.

Then `/speckit.plan`, `/speckit.tasks`, `/speckit.implement` again.

Notice how much of that prompt is boundary conditions rather than intent. That
ratio is the point, whichever tool writes the file. "Add rate limiting to the
API" is a quarter of a spec; the sliding-window sentence and the units of
`X-RateLimit-Reset` are the parts that decide whether the diff is mergeable.

---

## Mapping

| This repo | spec-kit |
| --------- | -------- |
| `constraints.md`, conventions half | `.specify/memory/constitution.md`, via `/speckit.constitution` |
| `constraints.md`, `deny` fence | no equivalent |
| `spec/<id>/SPEC.md` §1 to §4 | `specs/<id>/spec.md`, via `/speckit.specify` and `/speckit.clarify` |
| `spec/<id>/SPEC.md` §5, `allow` fence | no equivalent |
| `spec/<id>/SPEC.md` §6, review checklist | `/speckit.checklist` |
| `spec/<id>/acceptance.test.ts` | tasks in `tasks.md` that write tests |
| implementation notes, held in your head | `plan.md`, via `/speckit.plan` |
| you, prompting the agent at the spec | `/speckit.implement` |
| `scripts/gate.mjs` | no equivalent |
| `.github/workflows/gate.yml` | no equivalent |
| `npm run new-spec` | `/speckit.specify` |
| `AGENTS.md` | generated agent command files |

Two rows say "no equivalent", and they are the same row three times: the fences
and the thing that enforces them.

---

## What spec-kit has that this repo does not

- **Generation.** Writing `SPEC.md` by hand is the tax this repo charges. spec-kit
  drafts it, then interviews you about the gaps with `/speckit.clarify`.
- **A plan artifact.** `plan.md` and its research and contract files sit between
  spec and code. This repo has nothing there on purpose, because the example is
  small enough not to need one. Yours may not be.
- **Consistency checking.** `/speckit.analyze` looks for drift between spec, plan,
  and tasks before any code is written.
- **Agent portability.** One `specify init` targets Claude Code, Copilot, Gemini,
  Cursor, and more, from the same source of truth.
- **Task decomposition.** `tasks.md`, and `/speckit.taskstoissues` to push the
  breakdown into GitHub issues.

## What this repo has that spec-kit does not

- **A deny fence that is machine-checked.** "Do not edit the tests" is a sentence
  in a constitution until something fails the build over it.
- **Per-change allowed paths.** The `allow` fence scopes one change to a handful
  of files, so a diff that wandered is rejected before a human reads it.
- **A gate, in ~270 dependency-free lines.** Paths, then types, then tests, in
  that order, wired into CI as a required check. `scripts/gate.mjs` is short
  enough to read in one sitting and change to fit your repo.
- **Acceptance tests as the artifact, not a task.** The criterion that kills the
  plausible-but-wrong implementation is written and watched to fail *before* the
  agent is pointed at anything.

Neither list is an argument for one over the other. They are the two halves of
the same method: spec-kit is good at producing the definition of correct, and
this repo is good at refusing anything that does not meet it.

---

## Using both

Perfectly reasonable, and probably the best of it:

1. `specify init`, and let `/speckit.constitution` and `/speckit.specify` do the
   drafting. Getting a first draft out of an interview beats staring at a blank
   template.
2. Copy this repo's four portable pieces alongside: `constraints.md`,
   `scripts/gate.mjs`, `.github/workflows/gate.yml`, and the `allow` fence idea.
3. Put the deny fence in `constraints.md` and mirror it as a hard rule in the
   constitution, so the agent is told and the build checks.
4. Add an `allow` fence to each generated `spec.md`. The gate's spec discovery
   looks for a fenced block, so a spec-kit `spec.md` works once it has one.
5. Point the gate at `specs/` if you keep spec-kit's directory name. This repo
   uses `spec/`, singular; pick one and be consistent.
6. Make the gate a required check. `/speckit.implement` produces a diff like any
   other agent, and a plausible diff should not merge on vibes.

---

## A caveat about this file

spec-kit is under active development and its command names have already changed
once, from `/constitution` to `/speckit.constitution`. The prompts above are the
durable part; the exact command spellings are not. Check
[the repo](https://github.com/github/spec-kit) before pasting anything.
