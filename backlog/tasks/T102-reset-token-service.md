---
id: T102
title: Reset token service — mint, consume, rate-limit policies
epic: E12-account-recovery
status: todo
depends_on: [T100]
size: M
---

## Context

The domain logic of [ADR-0012](../../docs/adr/0012-password-reset-via-single-use-token.md), with
no HTTP and no email in it — so T103 (endpoints) and T106 (CLI script) can both sit on top and
behave identically.

Two details in the ADR are the whole point of this task and are easy to get subtly wrong: the
token is stored as a **SHA-256, not Argon2** (read "Why SHA-256 for the token" — it is not an
oversight), and consumption is **one statement**, for the same reason invite consumption is.

Read the ADR and [security.md](../../docs/context/security.md) § Authentication.

## Acceptance criteria

- [ ] `mintResetToken(userId)` → returns the **plaintext** token once and stores only its
      SHA-256. 32 bytes from `crypto.randomBytes`, base64url. The plaintext is never logged and
      never persisted
- [ ] `consumeResetToken(token, newPassword)` performs, atomically: validate unused and unexpired,
      mark used, hash the new password with the existing `hashPassword`, write it, delete the
      user's other outstanding tokens, and set `users.sessions_valid_from = now()`
- [ ] The claim is a **single UPDATE** with `WHERE used_at IS NULL AND expires_at > now()
      RETURNING user_id`. A read-then-write is the bug this criterion exists to prevent
- [ ] Password write and the `sessions_valid_from` bump are in **one transaction** with the token
      claim — a crash must not leave a spent token with the old password still working
- [ ] Expiry is 30 minutes, defined as a named constant, not a literal at the call site
- [ ] Invalid, expired, already-used and unknown tokens are indistinguishable to the caller: one
      error type, one message
- [ ] Two new entries in `src/server/rate-limit/policies.ts`, following the existing comment
      style that says *why* each number: `passwordResetRequest` (~3/hour) and
      `passwordResetConsume` (~10/15min)
- [ ] Integration tests against real Postgres (`DATABASE_URL_TEST`), covering: happy path;
      second use of the same token fails; expired token fails; a *concurrent* double-consume
      results in exactly one success; sibling tokens are gone afterwards; `sessions_valid_from`
      moved forward
- [ ] Argon2 hashing happens **outside** the transaction, as `registerUser` already does — it
      costs ~100ms and must not pin a connection

## Out of scope

HTTP routes, Zod request schemas, sending email, the enumeration-safe response shape (T103).
Enforcing `sessions_valid_from` at read time (T104) — this task only writes it.

## Files likely touched

```
src/server/services/password-reset.ts
src/server/services/password-reset.test.ts
src/server/rate-limit/policies.ts
src/server/errors.ts
```
