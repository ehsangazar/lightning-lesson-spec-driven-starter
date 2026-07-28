# SPEC __ID__ · __TITLE__

**Status:** draft
**Owner:**

> Fill this in before you prompt anything. If a section is hard to write, that
> difficulty is the finding: you were about to ask an agent for something you
> could not describe. Twenty minutes here beats an hour of reviewing a diff that
> was never going to be right.

---

## 1. Intent

One paragraph. What changes for the user, and why now. No implementation.

TODO

**Not doing** — the fence that stops scope creep. An agent will happily "improve"
things you never asked about; the only defence is naming them.

- TODO
- TODO

---

## 2. Interface

The contract, as types, before any implementation exists. This is the section
that most changes the quality of what comes back.

```ts
// src/TODO.ts

export interface TODO {
  // …
}

export function TODO(options: TODO): TODO
```

### Design constraints on the interface

- TODO — e.g. takes `now: number` rather than reading the clock, so it is testable.
- TODO — e.g. knows nothing about HTTP.

---

## 3. Behaviour

Numbered rules, each one thing, each checkable. If you cannot imagine the
assertion, the rule is not specific enough yet.

1. TODO
2. TODO

---

## 4. Acceptance criteria

Executable, in `acceptance.test.ts` next to this file. Prose here, assertions
there; if the two disagree, the test file wins.

| # | Criterion | Why it is here |
| - | --------- | -------------- |
| A1 | TODO | The headline behaviour |
| A2 | TODO | The failure mode you actually fear |
| A3 | TODO | The boundary a plausible-but-wrong version gets wrong |

At least one criterion should be one that a naive implementation passes the
others but fails. That is the criterion doing the real work.

---

## 5. Allowed paths

The gate reads this fence. A diff touching anything outside it fails
`npm run gate` before a human reads a line.

```allow
src/TODO.ts
spec/__DIR__/**
```

Keep it tight. If the list needs to be wide, the change is too big; split it.

Repo-wide rules that always apply, whatever is listed here, are in
[`constraints.md`](../../constraints.md).

---

## 6. Review checklist

What a human confirms once the gate is green. The gate proves the code does what
the spec says; this asks whether the spec was right.

- [ ] TODO
- [ ] TODO
