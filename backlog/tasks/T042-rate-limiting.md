---
id: T042
title: Token-bucket rate limiting
epic: E5-claims
status: done
depends_on: [T003]
size: M
---

## Context

Rate limiting lives in E5 because the anonymous claim endpoint is what most needs it, but **login
needs it sooner**. Argon2 verification is deliberately expensive (~50-100ms of CPU and 19 MB of
memory per attempt), so an unthrottled login endpoint is a cheap way for one client to saturate
the box. Registration matters too, since the invite gate stops account creation but not the
attempts.

So: build the mechanism now, apply it to the endpoints that exist (login, register), and let
`/api/preview` (T032) and claim/unclaim (T040) adopt it when they're written.

Storage is Postgres, not Redis — the volume doesn't justify another container, and Cloudflare
absorbs anything genuinely large before it reaches us. See
[data-model.md](../../docs/context/data-model.md) § *rate_limits* and
[api-contract.md](../../docs/context/api-contract.md) § *Rate limits*.

## Acceptance criteria

- [ ] `rate_limits` table keyed by an opaque string, with a token count and a timestamp
- [ ] **Token bucket**, not a fixed window. Fixed windows let a client spend the whole quota at
      the very end of one window and again at the start of the next — double the intended burst,
      and it synchronises clients into thundering herds.
- [ ] Tokens are **fractional**, so refill is smooth rather than stepping once per interval
- [ ] Consumption is a **single atomic statement**. A read-then-write lets concurrent requests
      both see the last token and both take it — which is precisely what a rate limiter must not do.
- [ ] A rejected request **does not** advance the timestamp, or a client hammering the endpoint
      would keep resetting its own refill clock and never recover
- [ ] Client IP comes from `CF-Connecting-IP`. Document why that's trustworthy here and what
      would make it not.
- [ ] `429` includes a `Retry-After` header with a sane number of seconds
- [ ] Applied to `POST /api/auth/login` and `POST /api/auth/register`
- [ ] Policies are named and declared in one place, not scattered as literals across routes
- [ ] **Fails open** on a storage error, with a log. A rate limiter outage should not take the
      site down — and the database being unavailable already breaks login anyway.
- [ ] A prune helper for idle buckets, so the table doesn't grow forever
- [ ] Tests: burst allowed up to capacity; the next request is rejected; tokens refill over time;
      separate keys don't interfere; concurrent requests can't over-consume; a rejected request
      doesn't reset the clock
- [ ] `npm run test:ci` passes

## Out of scope

Applying it to `/api/preview` (T032) and claim/unclaim (T040) — those endpoints don't exist yet.
Cloudflare WAF rules (T064), which are the first line in front of this.

## Files likely touched

```
src/server/db/schema.ts
src/server/db/migrations/
src/server/rate-limit/{index,policies,client-ip}.ts
src/server/rate-limit/rate-limit.test.ts
src/app/api/auth/{login,register}/route.ts
```
