---
id: T104
title: Enforce sessions_valid_from — make JWTs revocable
epic: E12-account-recovery
status: done
depends_on: [T100]
size: M
---

## Context

[ADR-0003](../../docs/adr/0003-jwt-in-httponly-cookie.md) accepted that sessions can't be revoked
before expiry, and said to revisit it if that ever mattered.
[ADR-0012](../../docs/adr/0012-password-reset-via-single-use-token.md) is that moment: a person
resetting because someone else knows their password is not helped by a flow that leaves the other
person's 30-day cookie working.

This task changes the hottest path in the app — every authenticated request — so it is deliberately
separate from T102/T103 and should be reviewed on its own. Read ADR-0012's "Why sessions must
become revocable" for why a column beat a session table.

## Acceptance criteria

- [ ] `currentUserId()` resolves the session by verifying the JWT **and then** comparing its `iat`
      against `users.sessions_valid_from`, returning null when the token predates it
- [ ] A token issued before a reset stops working immediately; one issued after keeps working
- [ ] A deleted user's token resolves to null rather than throwing — the user row is gone, so the
      lookup finds nothing, and that must read as "not logged in"
- [ ] Exactly one DB read per call, and `requireUserId()` does not duplicate it
- [ ] `iat` is second-granularity while `sessions_valid_from` is a timestamptz — a token minted in
      the same second as the bump must be treated as **invalid** (compare with `>=`, floor the
      column to seconds). Getting this backwards leaves a one-second window where the attacker's
      refreshed session survives; add a test that pins the boundary explicitly
- [ ] Tests cover: valid session; token predating the bump; token after; missing user; malformed
      token still returns null and never throws
- [ ] `docs/context/security.md` § Authentication updated to say sessions are revocable and how,
      and ADR-0003's consequence noted as superseded

## Out of scope

A session table, refresh tokens, "log out all devices" UI, and any change to token TTL or cookie
attributes. Do not cache the lookup — a cache here reintroduces exactly the staleness this
removes.

## Files likely touched

```
src/server/auth/session.ts
src/server/auth/session.test.ts
docs/context/security.md
docs/adr/0003-jwt-in-httponly-cookie.md
```
