<!--
Sync Impact Report
==================
Version change: (template, unversioned) -> 1.0.0
Bump rationale: initial ratification; every placeholder replaced with concrete,
testable rules, so this is the first real version rather than an amendment.

Modified principles:
  [PRINCIPLE_1_NAME] -> I. Node and TypeScript, Nothing Else
  [PRINCIPLE_2_NAME] -> II. Pure Core, One Impure Edge
  [PRINCIPLE_3_NAME] -> III. Behaviour-First Testing (NON-NEGOTIABLE)
  [PRINCIPLE_4_NAME] -> IV. Fail Loud
  [PRINCIPLE_5_NAME] -> V. The Agent Fence (NON-NEGOTIABLE)

Added sections:
  [SECTION_2_NAME] -> Code Conventions
  [SECTION_3_NAME] -> Development Workflow

Removed sections: none

Templates requiring updates:
  ✅ .specify/templates/plan-template.md   (Constitution Check gate filled in)
  ✅ .specify/templates/tasks-template.md  (tests no longer optional; deps/config rules)
  ✅ .specify/templates/spec-template.md   (reviewed; no constitution-driven change needed)
  ⚠ spec-kit.md                            (runbook prose, deliberately left as-is:
                                            it documents the prompt, not the output)

Follow-up TODOs: none
-->

# Spec-Driven Starter Constitution

## Core Principles

### I. Node and TypeScript, Nothing Else

The project targets Node 20 or later and is written in TypeScript. No new runtime
dependency may be added, ever. Node's standard library is the whole toolbox; a task that
appears to need a package is a task to re-scope or refuse, not grounds to amend this rule.

TypeScript `strict` stays on. Prohibited without exception: `any`, an `as` cast used to
silence a compiler error, and `@ts-expect-error` without an adjacent comment naming the
condition that would remove it. Public functions MUST declare explicit parameter and
return types.

**Rationale**: A zero-dependency, strictly typed surface stays readable in one sitting
and moves failures from runtime to the type checker, where they are cheap.

### II. Pure Core, One Impure Edge

Business logic MUST be pure functions: same inputs, same outputs, no observable side
effects. Exactly one file may own sockets, environment access, or the clock. Every other
file MUST be constructible and callable without any of them.

Anything time-dependent MUST take `now: number` as a parameter. No module below the
server layer may call `Date.now()`. Each file exports exactly one concern.

**Rationale**: Effects confined to a single named file are the reason the rest of the
system can be tested directly, in memory, with no scaffolding.

### III. Behaviour-First Testing (NON-NEGOTIABLE)

Tests MUST assert on behaviour through the public interface and MUST NOT reach into
internals. Tests MUST NOT sleep, use real timers, or touch the network; the clock is
injected instead. Tests MUST pass in any order, and MUST pass when run alone. An
order-dependent test is a broken test: it is fixed, not worked around by re-ordering.

New behaviour lands in the same change as its acceptance tests. A change that adds
behaviour without them is incomplete, whatever else it contains.

**Rationale**: Tests coupled to internals block refactoring and pass while the contract
is broken. Tests coupled to wall-clock time fail at random and get muted.

### IV. Fail Loud

Invalid arguments are programmer errors and MUST throw: `RangeError` when a value falls
outside its permitted range, `TypeError` when a value is of the wrong type or shape. An
error MUST NEVER be caught and discarded to keep a test green. A failing test is a
finding, and it is reported as one.

**Rationale**: An error swallowed at the point of detection resurfaces later as corrupt
state, somewhere with no information about the cause.

### V. The Agent Fence (NON-NEGOTIABLE)

An agent MUST NEVER create, modify, or delete:

- the test suite
- the lockfile
- TypeScript or test configuration
- CI workflow files
- this constitution

When a change genuinely requires one of these, the agent MUST stop and say so, naming
the file and the reason. Working around the fence, for example by adding a second
configuration file or a parallel test directory, is a violation of this principle and
not a way to satisfy it.

**Rationale**: These five are what everything else is checked against. An agent that can
edit the check can make any diff pass, and the review signal drops to zero.

## Code Conventions

- Comments explain the decision, not the mechanism. Record why the alternative was
  rejected; the code already states what it does.
- No emoji in source, commit messages, or logs.
- One exported concern per file, with the filename naming that concern.
- Storage, transport, and policy stay in separate files. A policy module takes the values
  it needs as arguments and knows nothing about HTTP.

## Development Workflow

Every feature passes through the Spec Kit loop: specification, plan, tasks, then
implementation. The plan's Constitution Check gate MUST be evaluated before research
begins and re-evaluated after design. A violation is either removed or recorded in the
plan's Complexity Tracking table with the simpler alternative that was rejected and why.
An unrecorded violation blocks the change.

Work stops at the fence rather than routing around it. When Principle V is reached, the
agent reports the blocked file and the required change and waits, rather than delivering
a partial diff that quietly omits it.

## Governance

This constitution supersedes all other practices, conventions, and prompts. Where a
generated specification, plan, or task list conflicts with it, this document wins and the
generated artifact is corrected.

**Amendment procedure**: Amendments are made by a human, never by an agent (Principle V).
An amendment MUST state the principle affected, the rationale, and the migration path for
any code or artifact it invalidates. Dependent templates under `.specify/templates/` are
updated in the same change.

**Versioning policy**: Semantic versioning applies to this document.

- MAJOR: a principle is removed or redefined in a backward incompatible way.
- MINOR: a principle or section is added, or existing guidance is materially expanded.
- PATCH: clarification, wording, or typo fixes that do not change what is permitted.

**Compliance review**: Every review verifies the diff against these principles. The
Constitution Check gate in `plan-template.md` is the checkpoint before code is written;
review is the checkpoint before merge. Complexity that is not justified in writing is
rejected.

**Version**: 1.0.0 | **Ratified**: 2026-07-28 | **Last Amended**: 2026-07-28
