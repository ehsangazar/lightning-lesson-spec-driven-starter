# Instructions for coding agents

Read this file first, then `constraints.md`, then the spec you were pointed at.
Do not start writing code until you have read all three.

## How work happens here

Every change is defined by a spec in `spec/<id>/`:

- `SPEC.md` — intent, interface, behaviour, acceptance criteria, allowed paths
- `acceptance.test.ts` — the same criteria, executable

The spec is the requirement. The prompt that brought you here is not. If they
disagree, the spec wins and you should say so rather than quietly picking one.

## Before you write anything

1. Read `constraints.md`. It lists paths you must never modify and conventions
   this codebase expects. It applies to every change.
2. Read the spec's `allow` fence. Those are the only files you may touch.
3. Read `acceptance.test.ts`. Those assertions are the definition of correct.
   Do not modify them to fit your implementation.
4. Run `npm test` and confirm the acceptance tests are failing for the reason
   the spec describes. If they pass already, stop: the work may be done.

## While you work

- Change only files inside the `allow` fence.
- Do not edit anything under `tests/`. That suite is the definition of "still
  works" and is off limits by design.
- Do not add dependencies. Do not weaken `tsconfig.json`. Do not exclude a
  failing test file.
- Match the surrounding code. Do not reformat code you did not change.
- Implement the interface as written in the spec. If the specified interface is
  genuinely wrong, say so and propose a change; do not silently invent a
  different shape that happens to pass.

## Before you claim it is done

Run:

```bash
npm run gate
```

This checks three things: the diff stayed inside the allowed paths, the project
typechecks, and every test passes. All three must be green.

If the gate fails, fix the cause. Do not adjust the gate, the constraints, or
the tests to make the failure go away.

## When you report back

State plainly:

- which acceptance criteria now pass, and which do not
- every file you changed
- any decision the spec did not settle, and what you assumed
- anything you believe is wrong with the spec itself

A change that is 80% done and honestly described is more useful than one
described as finished.
