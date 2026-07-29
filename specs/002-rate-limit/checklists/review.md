# Review Checklist: Per-Client Rate Limiting

**Purpose**: What a human confirms once `npm run gate` is green. The gate proves the code does what
the spec says; this asks whether the spec was right.
**Created**: 2026-07-29
**Feature**: [spec.md](../spec.md)

## The boundary

The five questions a fixed-bucket implementation fails. If only this section gets answered, the
review has done most of its job.

- [ ] A hit made at `t` still counts at `t + 59999` and does not count at `t + 60000`. Both sides
      asserted, not just one
- [ ] At `t + 60001` exactly one request is allowed, and the *next* one is refused
- [ ] Ten hits made at ten different moments free at ten different moments, not together
- [ ] A caller that retries throughout its block recovers at the same instant as one that waited
      quietly
- [ ] Nowhere in `src/rate-limit.ts` is there a window start, a bucket, or a modulo

## Units

- [ ] `X-RateLimit-Reset` is unix **seconds** in every response, and a test asserts the magnitude
      rather than mere presence
- [ ] `resetAt` inside the limiter is milliseconds, and the conversion to seconds happens exactly
      once, in `src/app.ts`
- [ ] `Retry-After` is a whole number and is never `0`

## Isolation and exemption

- [ ] Two keys genuinely cannot affect each other, including when one is fully blocked
- [ ] An empty `X-Client-Id` falls back to the address rather than becoming a shared empty key
- [ ] `/health` carries **no** rate-limit headers, rather than headers reporting an unlimited
      allowance
- [ ] `/health` consumes no allowance that another route would have used

## Constitution

- [ ] `src/rate-limit.ts` contains no `Date.now()`, no `process.env`, and no import from
      `node:http`
- [ ] Both `check` and `size` take `now` as a parameter
- [ ] The limiter's public interface mentions no header, path, method, or request
- [ ] Invalid arguments throw `RangeError` or `TypeError` rather than returning a decision

## Scope

- [ ] Nothing in the diff adds configuration, an environment variable, or a per-endpoint limit
- [ ] The diff touches only `src/rate-limit.ts`, `src/app.ts`, and `specs/002-rate-limit/**`
- [ ] Feature 001's regression tests pass untouched

## The question the gate cannot ask

- [ ] Is ten requests per sixty seconds actually the right limit for this service, or is it the
      number that appeared in the prompt?
