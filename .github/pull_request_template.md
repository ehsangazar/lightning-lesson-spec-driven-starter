## Spec

<!-- Link the spec this change implements, e.g. spec/001-rate-limit/SPEC.md -->

Implements: `spec/___/SPEC.md`

## Machine-checked

`npm run gate` covers these. Do not tick them by hand; paste the result.

- [ ] Path guard green — the diff touches only paths in the spec's `allow` fence
- [ ] Typecheck green
- [ ] Full test suite green, including the regression suite in `tests/`

## Human-checked

The part the gate cannot do. This is where review time should go.

- [ ] The spec's own review checklist has been answered
- [ ] The implementation matches the interface in section 2, not just the tests
- [ ] Each acceptance criterion fails without this change (spot-check one)
- [ ] Nothing in "Not doing" crept in
- [ ] Any assumption the spec did not settle is called out below

## Assumptions and open questions

<!-- What the spec left ambiguous, and what you decided. Empty is a valid answer,
     but it is worth a moment's thought before you write it. -->
