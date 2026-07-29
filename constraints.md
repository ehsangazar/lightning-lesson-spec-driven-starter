# Constraints

Repo-wide rules. True for every change, regardless of which spec is being built. This is the file
the agent reads before it writes anything, and the file the gate reads before it lets anything
through.

Per-change allowed paths live in the `allow` fence of the active `specs/<id>/spec.md`. This file
holds the rules that never move.

The prose half of this file duplicates
[`.specify/memory/constitution.md`](./.specify/memory/constitution.md) on purpose. The constitution
is what the agent is told; this is what the build checks. Step 9 of
[`spec-kit.md`](./spec-kit.md) is about closing the gap between those two, and a rule that lives in
only one of them is exactly the gap.

---

## Never touch

`npm run gate` fails if a diff modifies any of these, whatever the spec says. They are the things
an agent edits when it would rather change the rules than satisfy them.

```deny
tests/**
constraints.md
.specify/memory/constitution.md
package.json
package-lock.json
tsconfig.json
vitest.config.ts
.github/**
scripts/**
```

Why each one:

| Path | Why it is off limits |
| ---- | -------------------- |
| `tests/**` | The regression suite is the definition of "still works". A change that edits it to go green has proved nothing. |
| `constraints.md` | An agent that can widen its own constraints has none. |
| `.specify/memory/constitution.md` | Same reason, for the half the agent actually reads. |
| `package.json`, `package-lock.json` | New dependencies are a human decision. Most "I need a library for this" is not true. |
| `tsconfig.json` | Loosening `strict` makes errors disappear without fixing them. |
| `vitest.config.ts` | Excluding a failing file is not passing it. |
| `.github/**` | The gate cannot be the thing under negotiation. |
| `scripts/**` | Nor can the gate's implementation. |

If a change genuinely requires one of these, that is a conversation, not a commit. Stop and say so.

### Where this differs from the constitution, and why it matters

Principle V of the constitution names five things: the test suite, the lockfile, TypeScript or test
configuration, CI workflows, and the constitution itself. This fence adds two:

| Path | Status |
| ---- | ------ |
| `package.json` | **Not in Principle V.** Denied here because it carries the dependency list and the scripts the gate runs. |
| `scripts/**` | **Not in Principle V.** Denied here because it contains the gate. |

Until a maintainer amends Principle V, this file is stricter than the constitution. That is the
safe direction for the two to disagree, but they should not disagree for long: the point of having
both is that they say the same thing in two registers.

---

## Conventions to honour

Stated because an agent has no way to infer them from a small codebase, and will otherwise import
the average of the internet.

**Dependencies**

- No new runtime dependencies. Node's standard library and TypeScript only.
- No new dev dependencies without asking first.

**Types**

- `strict` is on and stays on. No `any`, no `as` to silence an error, no `@ts-expect-error` without
  a comment saying what will remove it.
- Public functions get explicit parameter and return types.
- Prefer `interface` for object shapes, `type` for unions and aliases.

**Structure**

- Business logic is pure functions. `src/server.ts` is the only file allowed to own sockets,
  environment, or the clock.
- Anything time-dependent takes `now: number` as a parameter. Never call `Date.now()` below the
  server layer. Untestable time is how flaky suites start.
- One exported concern per file. If a file needs "and" to describe it, split it.

**Tests**

- New behaviour lands with its acceptance tests.
- Tests assert on behaviour through the public interface, not on internals.
- No `sleep`, no real timers, no network. Inject the clock.
- A test that has to be run in a particular order is a broken test.

**Errors**

- Fail loud and early on programmer error: throw `RangeError`/`TypeError` for invalid arguments.
- Never swallow an error to keep a test green.

**Style**

- No comments that restate the code. Comment the decision, not the mechanism.
- Match the surrounding file. Do not reformat code you did not change.
- No emoji in source, commits, or logs.

---

## Definition of done

A change is done when all of these hold, in order:

1. `npm run gate` is green: the path guard, then typecheck, then the full test suite.
2. The diff touches only paths in the active spec's `allow` fence.
3. Every acceptance criterion in the spec maps to a test that fails without the change and passes
   with it.
4. The regression suite passes untouched.
5. The spec's review checklist has been answered by a human.

Steps 1 to 4 are machine-checkable, which is the entire point. Step 5 is the part worth a human's
attention, and it is only reachable once the first four are true.
