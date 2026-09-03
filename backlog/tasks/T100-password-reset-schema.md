---
id: T100
title: Schema — password_reset_tokens + users.sessions_valid_from
epic: E12-account-recovery
status: done
depends_on: []
size: S
---

## Context

The storage half of [ADR-0012](../../docs/adr/0012-password-reset-via-single-use-token.md).
A reset token must be single-use, which is why it needs a table rather than a signed JWT — read
the ADR's "Why not a JWT" before proposing a stateless alternative.

`sessions_valid_from` is the smaller of the two changes and the more consequential one: it makes
JWTs revocable, which [ADR-0003](../../docs/adr/0003-jwt-in-httponly-cookie.md) explicitly
deferred. T104 is what enforces it; this task only adds the column so the two can land
independently.

Read [data-model.md](../../docs/context/data-model.md) and the ADR. This is schema only — no
service code, no endpoints.

## Acceptance criteria

- [ ] `password_reset_tokens` table added to `src/server/db/schema.ts`:
      `token_hash` text primary key · `user_id` uuid not null, FK to `users.id`
      `ON DELETE CASCADE` · `expires_at` timestamptz not null · `used_at` timestamptz nullable ·
      `created_at` timestamptz not null default `now()`
- [ ] Index on `user_id` — "delete this user's other outstanding tokens" is a real query path
- [ ] `users.sessions_valid_from` timestamptz, **not null**, defaulting to `now()`. Not nullable:
      a null would force every read site to decide what null means, and the answer is always
      "the account's epoch"
- [ ] Migration generated via `npm run db:generate` and committed, applying cleanly on a fresh
      volume (`npm run db:reset && npm run db:migrate`) **and** on top of the current production
      schema
- [ ] Existing rows backfill to `now()` at migration time — not to epoch, which would be a
      no-op, and not to a future date, which would log everyone out on deploy
- [ ] Schema test extends the existing `core-schema.test.ts` pattern: cascade delete removes a
      user's tokens; `token_hash` rejects duplicates

## Out of scope

Minting, consuming, hashing, endpoints, and the `currentUserId()` check (T102, T103, T104).
No changes to `users` beyond the one column.

## Files likely touched

```
src/server/db/schema.ts
src/server/db/migrations/00NN_password_reset.sql
src/server/db/core-schema.test.ts
docs/context/data-model.md
```
