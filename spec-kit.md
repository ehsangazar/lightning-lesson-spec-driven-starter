# Building this repo with spec-kit

[github/spec-kit](https://github.com/github/spec-kit) is GitHub's toolkit for
the same idea this repo demonstrates: *define what to build before building it,
with any AI coding agent*. It ships a CLI and a set of slash commands that
generate the spec, the plan, and the task list for you.

This file is a runbook. Start in an empty directory, work down the steps, and
you end up with something like this repository built by spec-kit instead of by
the four hand-written files here. Every prompt is written out in full and meant
to be copied.

The last three sections are the comparison: where the two tools overlap, and
where each leaves a hole the other fills.

**The one-line version: spec-kit generates the spec, this repo enforces it.**
spec-kit's output is documents an agent is asked to follow. This repo's deny
fence and `scripts/gate.mjs` are a check that fails the build when it does not.
Different jobs. You can have both, and [step 9](#step-9-bolt-the-gate-on) does.

---

## At a glance

| Step | Command | Produces |
| ---- | ------- | -------- |
| [1](#step-1-setup) | `specify init` | `.specify/`, agent commands |
| [2](#step-2-the-constitution) | `/speckit.constitution` | `.specify/memory/constitution.md` |
| [3](#step-3-specify-the-service) | `/speckit.specify` | `specs/001-*/spec.md` |
| [4](#step-4-clarify) | `/speckit.clarify` | edits to `spec.md` |
| [5](#step-5-plan) | `/speckit.plan` | `plan.md` and supporting files |
| [6](#step-6-tasks-and-implement) | `/speckit.tasks`, `/speckit.implement` | `tasks.md`, then code |
| [7](#step-7-the-feature-that-matters) | `/speckit.specify` again | `specs/002-*/spec.md` |
| [8](#step-8-the-rest-of-the-loop) | plan, tasks, implement | the feature |
| [9](#step-9-bolt-the-gate-on) | copy four files from here | a gate that blocks a bad diff |

Steps 1 to 8 are spec-kit. Step 9 is this repo. Optional commands
(`/speckit.clarify`, `/speckit.analyze`, `/speckit.checklist`) are marked as
such where they appear.

**Before you start:** [uv](https://docs.astral.sh/uv/) installed, Node 20+, and
a coding agent that spec-kit supports (Claude Code, Copilot, Gemini CLI, Cursor,
and others).

---

## Step 1: Setup

Run in the shell:

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v0.14.3
specify init spec-driven-starter --integration claude
cd spec-driven-starter
```

Pin a real tag; the command surface moves. spec-kit's own README writes this as
`@vX.Y.Z`, which is a placeholder, not a version: pasted literally it fails with
`couldn't find remote ref`. `v0.14.3` was current when this was written. For the
latest:

```bash
git ls-remote --tags --refs https://github.com/github/spec-kit.git | sort -V | tail -1
```

`--integration` takes your agent name; `specify check` lists the available ones.
To scaffold into a directory that already exists, use `specify init .` or the
`--here` flag rather than letting it create a subdirectory. If that directory is
not empty it asks for confirmation first, which `--force` skips:

```bash
specify init . --integration claude --force
```

Init needs no network access. The templates are bundled in the CLI, which is why
pinning the version pins what you get.

**Creates:** `.specify/`, and the slash commands in your agent's command
directory, for example `.claude/commands/`.

Everything from here on is typed **in the agent**, not the shell.

---

## Step 2: The constitution

spec-kit's constitution is this repo's [`constraints.md`](./constraints.md):
project-wide rules that hold for every feature, written once.

Prompt, after `/speckit.constitution`:

```text
Node 20+ and TypeScript only. No new runtime dependencies, ever; Node's
standard library is the whole toolbox. `strict` stays on: no `any`, no `as`
to silence an error, no `@ts-expect-error` without a comment saying what
removes it. Public functions get explicit parameter and return types.

Business logic is pure functions. Exactly one file may own sockets,
environment, or the clock. Anything time-dependent takes `now: number` as a
parameter; nothing below the server layer calls `Date.now()`. One exported
concern per file.

Tests assert on behaviour through the public interface, never on internals.
No sleeps, no real timers, no network: inject the clock. Order-dependent
tests are broken tests. New behaviour lands with its acceptance tests.

Fail loud on programmer error: throw `RangeError` or `TypeError` for invalid
arguments. Never swallow an error to keep a test green. Comment the decision,
not the mechanism. No emoji in source, commits, or logs.

An agent may never modify the test suite, the lockfile, the TypeScript or
test configuration, CI workflows, or this constitution. If a change genuinely
needs one of those, stop and say so.
```

**Creates:** `.specify/memory/constitution.md`.

**The point:** that last paragraph is where the seam shows. Here it is a rule
stated to a model. In this repo the same list is the `deny` fence that
`npm run gate` reads, and the build fails on it whether the model agreed or not.
Step 9 closes that gap.

---

## Step 3: Specify the service

This repo starts with a small API already in place and adds rate limiting to it.
From scratch, that is two features. The first is scaffolding, so keep it brief.

Prompt, after `/speckit.specify`:

```text
A minimal HTTP JSON API with no framework, built on `node:http`. Three
routes: `GET /health` returns `{ "ok": true }`; `POST /items` accepts
`{ "name": string }` and returns the created item with a generated id;
`GET /items` returns every item created so far.

Storage is in-memory and resets when the process restarts. Unknown routes
return 404 with `{ "error": "not_found" }`; malformed JSON returns 400 with
`{ "error": "bad_request" }`.

The request handler must be constructible without opening a socket, so tests
can drive it directly.

Not doing: authentication, persistence, pagination, updates or deletes.
```

**Creates:** `specs/001-*/spec.md`, and records the active feature in
`.specify/feature.json`. The feature directory is what tracks state, not the git
branch.

---

## Step 4: Clarify

Optional, and worth it.

```text
/speckit.clarify
```

spec-kit interviews you about the ambiguities it found and folds the answers
back into `spec.md`.

**The point:** this is the mechanised version of the moment in this repo's
README where writing section 2 of `SPEC.md` turns out to be hard. That
difficulty is the finding, whichever tool surfaces it.

---

## Step 5: Plan

Prompt, after `/speckit.plan`:

```text
TypeScript with Node's built-in type stripping, no build step. Vitest for
tests. Zero runtime dependencies.

`src/store.ts` owns item storage as pure functions. `src/app.ts` builds the
request handler and takes its dependencies as options. `src/server.ts` is the
only file that touches sockets or the environment. Regression tests live in
`tests/`.
```

**Creates:** `plan.md` beside the spec, plus whatever the plan template calls
for: research notes, data model, contracts.

**The point:** this repo has no equivalent artifact, on purpose, because the
example is small enough not to need one. Yours may not be.

---

## Step 6: Tasks and implement

```text
/speckit.tasks        creates tasks.md, the ordered breakdown
/speckit.analyze      optional: cross-checks spec, plan, and tasks for drift
/speckit.implement    executes the breakdown
```

Also available: `/speckit.checklist` generates review checklists, which is
section 6 of this repo's `SPEC.md` template, and `/speckit.taskstoissues` pushes
the breakdown into GitHub issues.

You now have a working service. Nothing interesting has happened yet.

---

## Step 7: The feature that matters

Rate limiting is where a spec earns its keep, and the direct comparison with
[`spec/001-rate-limit/SPEC.md`](./spec/001-rate-limit/SPEC.md).

Prompt, after `/speckit.specify`. It is split into four parts on purpose;
watch how little of it is intent:

**Intent**

```text
Add per-client rate limiting so one noisy caller degrades only itself. Ten
requests per sixty seconds per key. The key is the `X-Client-Id` header when
present, otherwise the remote IP; distinct keys never affect each other.
```

**The behaviour that a plausible implementation gets wrong**

```text
The window is sliding, not a fixed calendar bucket: each hit stops counting
exactly 60000 ms after it happened, and each expires independently. At
t = 59999 ms a blocked caller is still blocked; at t = 60001 ms exactly one
slot has freed, not all ten.
```

**The rest of the contract**

```text
Over the limit responds 429 with `{ "error": "rate_limited" }` and a
`Retry-After` header in whole seconds, never below 1.

Every non-exempt response, allowed or rejected, carries `X-RateLimit-Limit`,
`X-RateLimit-Remaining`, and `X-RateLimit-Reset`, where Reset is unix
SECONDS, not milliseconds. Remaining counts down 9, 8, 7 and pins at 0 when
blocked.

Rejected requests do not consume a slot: being blocked must not extend the
block.

`/health` is never limited at any volume and carries no rate-limit headers.

Keys whose hits have all expired are dropped, and the tracked key count is
observable so the memory bound can be asserted.

The limiter takes the current time as an argument and never reads the clock
itself. It knows nothing about HTTP: it takes a string key, not a request.
```

**The fence**

```text
Not doing: distributed or cross-process limiting, per-endpoint or per-plan
limits, configuration or env vars, persistence.
```

**Creates:** `specs/002-*/spec.md`.

**The point, and it is the whole lesson:** "add rate limiting to the API" is the
first block only, a quarter of a spec. The sliding-window paragraph and the
units of `X-RateLimit-Reset` are what decide whether the diff is mergeable. A
fixed 60-second bucket satisfies every other line here and fails the second
block. Write one paragraph like that per spec and the spec starts paying for
itself.

---

## Step 8: The rest of the loop

```text
/speckit.plan
/speckit.tasks
/speckit.implement
```

Same as steps 5 and 6. You now have the feature.

---

## Step 9: Bolt the gate on

Everything above produced documents. Nothing yet *refuses* a diff that ignores
them. Copy four things out of this repo:

```
constraints.md                 the deny fence
scripts/gate.mjs               paths, then types, then tests
.github/workflows/gate.yml     the same gate, blocking merge
spec/_template/SPEC.md         for the allow fence idea, section 5
```

Then:

1. Put the deny fence in `constraints.md` **and** mirror it as a hard rule in
   the constitution, so the agent is told and the build checks.
2. Add an `allow` fence to each generated `spec.md`. The gate discovers a spec
   by looking for that fenced block, so a spec-kit `spec.md` works once it has
   one.
3. Point the gate at `specs/` if you keep spec-kit's directory name. This repo
   uses `spec/`, singular. Pick one and be consistent.
4. Wire the gate to your commands at the bottom of `scripts/gate.mjs`, and add
   `"gate": "node scripts/gate.mjs"` to `package.json`.
5. Make the gate a required check on your default branch. `/speckit.implement`
   produces a diff like any other agent, and a plausible diff should not merge
   on vibes.

---

## Where the two differ

| This repo | spec-kit |
| --------- | -------- |
| `constraints.md`, conventions half | `.specify/memory/constitution.md` |
| `constraints.md`, `deny` fence | **no equivalent** |
| `SPEC.md` §1 to §4 | `spec.md`, via `/speckit.specify` and `/speckit.clarify` |
| `SPEC.md` §5, `allow` fence | **no equivalent** |
| `SPEC.md` §6, review checklist | `/speckit.checklist` |
| `acceptance.test.ts` | tasks in `tasks.md` that write tests |
| implementation notes, held in your head | `plan.md` |
| you, prompting the agent at the spec | `/speckit.implement` |
| `scripts/gate.mjs` | **no equivalent** |
| `.github/workflows/gate.yml` | **no equivalent** |
| `npm run new-spec` | `/speckit.specify` |
| `AGENTS.md` | generated agent command files |

Three rows say "no equivalent" and they are the same row three times: the
fences, and the thing that enforces them.

### What spec-kit has that this repo does not

- **Generation.** Writing `SPEC.md` by hand is the tax this repo charges.
- **An interview.** `/speckit.clarify` asks about the gaps instead of leaving a
  blank template to stare at.
- **A plan artifact.** `plan.md` and its research and contract files sit between
  spec and code.
- **Consistency checking.** `/speckit.analyze` finds drift between spec, plan,
  and tasks before any code is written.
- **Agent portability.** One `specify init` targets several agents from the same
  source of truth.
- **Task decomposition.** `tasks.md`, and `/speckit.taskstoissues` to push it
  into GitHub issues.

### What this repo has that spec-kit does not

- **A deny fence that is machine-checked.** "Do not edit the tests" is a
  sentence in a constitution until something fails the build over it.
- **Per-change allowed paths.** The `allow` fence scopes one change to a handful
  of files, so a diff that wandered is rejected before a human reads it.
- **A gate, in ~270 dependency-free lines.** Paths, then types, then tests, in
  that order, wired into CI as a required check. Short enough to read in one
  sitting and change to fit your repo.
- **Acceptance tests as the artifact, not a task.** The criterion that kills the
  plausible-but-wrong implementation is written, and watched to fail, *before*
  the agent is pointed at anything.

Neither list is an argument for one over the other. They are two halves of one
method: spec-kit is good at producing the definition of correct, and this repo
is good at refusing anything that does not meet it.

---

## A caveat about this file

spec-kit is under active development and its command names have already changed
once, from `/constitution` to `/speckit.constitution`. The prompts above are the
durable part; the exact spellings are not. Check
[the repo](https://github.com/github/spec-kit) before pasting anything.
