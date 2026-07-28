# spec-driven-starter

A coding agent will produce a plausible diff for almost anything. Plausible is
not mergeable.

The fix is not a better model. It is an **executable spec** that says what
correct means, and a **gate** that refuses the diff until it is. This repo is a
small working example of both, plus the template you copy into your own project.

Companion to the lightning lesson *Spec-Driven Development: Coding Agents That
Ship*. It stands on its own; you do not need to have watched it.

```
SPEC.md          intent, interface, behaviour, acceptance criteria, allowed paths
constraints.md   repo-wide rules the agent reads before it writes anything
tests/           the regression suite, which the agent may not edit
scripts/gate.mjs the gate: allowed paths, then types, then tests
```

---

## 60 seconds: see it work

```bash
git clone https://github.com/ehsangazar/spec-driven-starter.git
cd spec-driven-starter
npm install
npm run gate
```

Green. Now break a rule on purpose:

```bash
echo "// hello" >> tests/api.test.ts
npm run gate
```

Red, before a single test ran, because `tests/**` is in the `deny` fence of
[`constraints.md`](./constraints.md). Undo it with `git checkout -- tests/`.

That is the whole idea in one command. Everything below is detail.

---

## What is actually in here

A tiny HTTP API, and one feature built spec-first: per-client rate limiting.

| Path | What it is |
| ---- | ---------- |
| [`spec/001-rate-limit/SPEC.md`](./spec/001-rate-limit/SPEC.md) | The worked example. Read this one first. |
| [`spec/001-rate-limit/acceptance.test.ts`](./spec/001-rate-limit/acceptance.test.ts) | The same criteria, executable. |
| [`constraints.md`](./constraints.md) | Never-touch paths and the conventions to honour. |
| [`AGENTS.md`](./AGENTS.md) | What the agent reads first. `CLAUDE.md` points here. |
| [`scripts/gate.mjs`](./scripts/gate.mjs) | The gate, in ~270 dependency-free lines. Read it, distrust it, change it. |
| [`spec-kit.md`](./spec-kit.md) | The same repo, built with [github/spec-kit](https://github.com/github/spec-kit): the prompts, the mapping, and what each side is missing. |
| [`.github/workflows/gate.yml`](./.github/workflows/gate.yml) | The same gate, blocking merge. |
| `src/`, `tests/` | The service, and the regression suite that predates the feature. |

Node 20+. No runtime dependencies. TypeScript and Vitest are the only dev deps.
(`npm start`, which runs the service for real, wants Node 22.6+ for TypeScript
stripping. Nothing else needs it.)

---

## A spec is four things, not a paragraph of intent

Ad-hoc prompting supplies the first quarter of this and leaves the rest to luck.

| | | Where it lives |
| - | - | - |
| 1 | **Interface and types**: the contract, written before any implementation | `SPEC.md` §2 |
| 2 | **Acceptance criteria**: executable, failing before the change | `acceptance.test.ts` |
| 3 | **Constraints**: what it must not touch or do | `SPEC.md` §5 + `constraints.md` |
| 4 | **Conventions**: what this codebase expects, which nothing can infer | `constraints.md` |

The single highest-value line in the whole repo is the one that is *missing*
from the allowed paths in `SPEC.md` §5: `tests/**`. The agent cannot edit the
regression suite. That one omission removes the most common way a red build
turns green without anything being fixed.

### The criterion that does the work

Any implementation passes the obvious tests. Look at **A3** in the spec:

> At `t = 59_999 ms` the caller is still blocked; at `t = 60_001 ms` exactly one
> slot has freed.

A fixed 60-second calendar bucket, which is what you tend to get when you ask
for "rate limiting", passes every other criterion and fails this one. It hands
back all ten slots at once. Write one criterion like that per spec, the one a
plausible-but-wrong version gets wrong, and the spec starts earning its keep.

---

## Run the demo yourself

Rewind the repo to before the feature existed, and build it twice:

```bash
npm run demo:reset
npm test          # regression suite green; acceptance suite red. That red is the spec.
```

**Run 1, ad-hoc.** Ask your agent: *"add rate limiting to the API"*. You will
get something. Then run `npm run gate`. Typically it edits files it should not,
picks a fixed window, and gets the reset header units wrong.

**Run 2, spec-first.** Reset again, then ask: *"Read constraints.md, then
implement spec/001-rate-limit/SPEC.md"*. Run `npm run gate`.

The difference is not the model. It is that in run 2 the word "correct" had a
definition.

```bash
git checkout -- src/    # restore the finished implementation
```

---

## Point it at your own repo in 10 minutes

**1. Copy four files** into your project:

```
constraints.md
spec/_template/
scripts/gate.mjs
.github/workflows/gate.yml
```

**2. Edit `constraints.md`** (~5 min, the only part that needs thought). Two
lists:

- the `deny` fence: paths an agent must never modify. Start with your test
  directory, lockfile, CI config, and the gate itself.
- the conventions section: the things a newcomer gets wrong. Your error
  handling, your logging, your "we do not add dependencies" rule.

Write the rules you have actually had to give a human in review. Those are the
real ones.

**3. Wire the gate to your commands.** The bottom of `scripts/gate.mjs`:

```js
run('typecheck', '2. Types', 'npx', ['tsc', '--noEmit'])
run('tests', '3. Tests', 'npx', ['vitest', 'run'])
```

Swap in `pytest`, `go test`, `cargo test`, whatever you run. The path guard
above it is language-agnostic and needs no changes.

**4. Add the script** to `package.json` (or your Makefile):

```json
"gate": "node scripts/gate.mjs"
```

**5. Write your first spec:**

```bash
npm run new-spec -- "the next thing you were about to prompt for"
```

Fill in sections 2 and 5 first, interface and allowed paths. Turn section 4 into
real assertions. Run your tests and watch them fail. **Only then** point the
agent at it.

**6. Make the gate a required check** on your default branch, so a plausible
diff cannot merge on vibes.

---

## Working this way, day to day

```bash
npm run new-spec -- "cache invalidation"   # scaffold spec/002-cache-invalidation/
# write SPEC.md sections 2 and 5
# write the acceptance tests, watch them fail
# then: "Read constraints.md, then implement spec/002-cache-invalidation/SPEC.md"
npm run gate
```

The gate auto-detects which spec you are working on from the files in your diff.
One spec per change; it will tell you off if a diff spans two.

Useful variations:

```bash
npm run gate -- 001-rate-limit     # name the spec explicitly
BASE=origin/develop npm run gate   # diff against a different base branch
```

### What the gate does not do

Worth being straight about, because a gate you over-trust is worse than none.

- It checks **paths**, not intent. An agent can still write bad code inside the
  allowed files. That is what the review checklist at the end of each spec is
  for.
- Coverage is not correctness. It proves your assertions pass, and nothing about
  the assertions you did not write.
- It only knows what your spec told it. A vague spec produces a green gate and a
  wrong feature, faster than before.

The gate handles the machine-checkable half so a human's attention goes to the
half that is actually hard.

---

## The order that makes it work

1. Write the spec: interface, then allowed paths.
2. Write the acceptance tests. **Watch them fail.** A test that has never been
   red has proved nothing.
3. Point the agent at the spec, not at your intent.
4. Run the gate. Fix causes, never the gate.
5. Review the human half: was the spec right?

Steps 1 and 2 happen before any prompting. That order is the whole method.

---

MIT licensed. Take it, gut it, make it yours.
Built by [Ehsan Gazar](https://gazar.dev).
